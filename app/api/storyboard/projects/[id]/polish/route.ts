import { NextResponse } from "next/server";
import { getCurrentUser } from "@/app/lib/auth";
import { createServerSupabaseClient } from "@/app/lib/supabaseServer";
import { finishUsage, reserveUsage } from "@/app/lib/usage";
import { withContinuityPrompt } from "@/app/lib/storyboardContinuity";
import { originalVideoUrl } from "@/app/lib/lipsyncSource";
import { normalizeSpeakerName, stableSpeakerVoice, type SpeakerVoiceProfile } from "@/app/lib/speakerVoice";

type PolishedShot = { shot_number: number; dialogue: string; sound: string; duration_seconds: number; speaker_name: string; speaker_voice: SpeakerVoiceProfile };
type Character = { id: string; name: string; voice_id?: string; voice_language?: string };

function parseJson(text: string) {
  const clean = text.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  const start = clean.indexOf("{"); const end = clean.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("AI 未返回有效的对白修复结果");
  return JSON.parse(clean.slice(start, end + 1)) as { shots?: PolishedShot[] };
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI 服务尚未配置" }, { status: 503 });
  const { id } = await params; const supabase = await createServerSupabaseClient(); let eventId = "";
  try {
    const { data: project } = await supabase.from("storyboard_projects").select("id,title,source_text,storyboard_shots(*)").eq("id", id).eq("user_id", user.id).maybeSingle();
    if (!project) return NextResponse.json({ error: "没有找到这个分镜项目" }, { status: 404 });
    const shots = (project.storyboard_shots ?? []).toSorted((a, b) => a.shot_number - b.shot_number);
    if (!shots.length) return NextResponse.json({ error: "项目还没有分镜" }, { status: 400 });
    const schema = { type: "object", additionalProperties: false, required: ["shots"], properties: { shots: { type: "array", minItems: shots.length, maxItems: shots.length, items: { type: "object", additionalProperties: false, required: ["shot_number","dialogue","sound","duration_seconds","speaker_name","speaker_voice"], properties: { shot_number: { type: "integer" }, dialogue: { type: "string" }, sound: { type: "string" }, duration_seconds: { type: "integer", minimum: 2, maximum: 15 }, speaker_name: { type: "string" }, speaker_voice: { type: "string", enum: ["female","male","neutral"] } } } } } };
    const usage = await reserveUsage(user.id, "chat"); eventId = usage.eventId;
    const response = await fetch("https://api.x.ai/v1/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, cache: "no-store", body: JSON.stringify({ model: "grok-4.5", temperature: 0.25, max_tokens: 8000, response_format: { type: "json_schema", json_schema: { name: "polished_dialogue", strict: true, schema } }, messages: [
      { role: "system", content: `你是竖屏漫剧对白导演。逐镜修复对白和表演指令，但不能改变事件、人物关系、地点、道具和结局。要求：每镜只允许一个人说话；台词口语化、有明确目的和潜台词；不能复述画面；每秒最多约4个汉字；相邻镜头情绪变化必须由事件触发。dialogue 无需说话时可为空。speaker_name 填唯一说话角色的准确姓名，旁白或无人说话填空；speaker_voice 根据原故事明确身份填 female、male 或 neutral，同一角色跨镜保持一致，不凭姓名刻板猜测。sound 必须以“表演：”开头，写清主情绪、强度1-5、语速、音量、停顿和潜台词，再写环境声与动作音效。duration_seconds 必须足够说完台词并留0.5秒呼吸。保持 shot_number 不变。` },
      { role: "user", content: `项目：${project.title}\n原始故事：${String(project.source_text ?? "").slice(0, 8000)}\n分镜：${JSON.stringify(shots.map((shot) => ({ shot_number: shot.shot_number, scene: shot.scene, action: shot.action, dialogue: shot.dialogue, sound: shot.sound, duration_seconds: shot.duration_seconds, characters: shot.character_names })))}` },
    ] }) });
    const result = await response.json(); if (!response.ok) throw new Error(result?.error?.message ?? "对白修复失败");
    const polished = parseJson(result?.choices?.[0]?.message?.content ?? "").shots ?? [];
    if (polished.length !== shots.length) throw new Error("AI 返回的镜头数量不完整");
    const { data: characterRows } = await supabase.from("characters").select("id,name,voice_id,voice_language").eq("user_id", user.id);
    const characters = (characterRows ?? []) as Character[];
    const profiles = new Map<string, "female" | "male">();
    for (const item of polished) { const key=normalizeSpeakerName(item.speaker_name);if(key&&(item.speaker_voice==="female"||item.speaker_voice==="male")&&!profiles.has(key))profiles.set(key,item.speaker_voice); }
    let upgradedPrompts = 0;
    let upgradedVoices = 0;
    for (const item of polished) {
      const current = shots.find((shot) => shot.shot_number === item.shot_number); if (!current) continue;
      const shotIndex = shots.findIndex((shot) => shot.id === current.id);
      const changed = String(current.dialogue ?? "").trim() !== String(item.dialogue ?? "").trim();
      const speakerName = String(item.speaker_name ?? "").trim();
      const boundSpeaker = characters.find((character) => character.id === current.speaker_character_id);
      const namedSpeaker = characters.find((character) => normalizeSpeakerName(character.name) === normalizeSpeakerName(speakerName));
      const speaker = boundSpeaker ?? namedSpeaker;
      const speakerCharacterId = current.speaker_character_id ?? namedSpeaker?.id ?? null;
      const voiceId = speaker?.voice_id || stableSpeakerVoice(speakerName, profiles.get(normalizeSpeakerName(speakerName)) ?? item.speaker_voice);
      const voiceChanged = Boolean(item.dialogue.trim()) && (String(current.voice_id ?? "") !== voiceId || (current.speaker_character_id ?? null) !== speakerCharacterId);
      if (voiceChanged) upgradedVoices++;
      const imagePrompt = withContinuityPrompt(String(current.image_prompt ?? ""), current, shots[shotIndex - 1], shots[shotIndex + 1], "image");
      const videoPrompt = withContinuityPrompt(String(current.video_prompt ?? ""), current, shots[shotIndex - 1], shots[shotIndex + 1], "video");
      if (imagePrompt !== current.image_prompt || videoPrompt !== current.video_prompt) upgradedPrompts++;
      const updates: Record<string, unknown> = { dialogue: String(item.dialogue ?? "").trim(), sound: String(item.sound ?? "").trim(), duration_seconds: Math.min(15, Math.max(2, Number(item.duration_seconds ?? current.duration_seconds))), image_prompt: imagePrompt, video_prompt: videoPrompt, voice_id: voiceId, voice_language: speaker?.voice_language || current.voice_language || "zh", speaker_character_id: speakerCharacterId };
      if (changed || voiceChanged) {
        let reusableVideo = current.video_url ?? null;
        if (current.media_status === "lipsync_ready") reusableVideo = await originalVideoUrl(supabase, user.id, current.project_id, current.id);
        Object.assign(updates, { audio_url: null, video_url: reusableVideo, subtitle_start_ms: null, subtitle_end_ms: null, media_status: reusableVideo ? "completed" : "pending", error_message: null });
      }
      const { error } = await supabase.from("storyboard_shots").update(updates).eq("id", current.id).eq("user_id", user.id); if (error) throw error;
    }
    const { data: updated } = await supabase.from("storyboard_shots").select("*").eq("project_id", id).eq("user_id", user.id).order("shot_number");
    const credits = await finishUsage(user.id, eventId, true); return NextResponse.json({ shots: updated ?? [], credits, upgradedPrompts, upgradedVoices });
  } catch (error) {
    if (eventId) await finishUsage(user.id, eventId, false).catch(() => undefined);
    return NextResponse.json({ error: error instanceof Error ? error.message : "对白修复失败" }, { status: 500 });
  }
}
