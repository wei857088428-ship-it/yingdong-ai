import { NextResponse } from "next/server";
import { getCurrentUser } from "@/app/lib/auth";
import { createServerSupabaseClient } from "@/app/lib/supabaseServer";
import { finishUsage, reserveUsage } from "@/app/lib/usage";
import { originalVideoUrl } from "@/app/lib/lipsyncSource";

const voices = new Set(["ara", "eve", "leo", "rex", "sal", "carina", "zagan", "helix", "orion", "luna", "iris", "altair", "zenith", "perseus", "helios", "lux", "kepler"]);
const languages = new Set(["zh", "en", "ja", "auto"]);
type AudioTimestamps = { graph_chars?: string[]; graph_times?: number[][] };

function captionCues(dialogue: string, timestamps?: AudioTimestamps) {
  const chars=timestamps?.graph_chars??[];const times=timestamps?.graph_times??[];if(!chars.length||chars.length!==times.length)return [];
  const visible:Array<{char:string;start:number;end:number}>=[];let angle=0;let square=0;
  for(let index=0;index<chars.length;index++){const char=chars[index];if(char==="<"){angle++;continue;}if(char===">"){angle=Math.max(0,angle-1);continue;}if(char==="["){square++;continue;}if(char==="]"){square=Math.max(0,square-1);continue;}if(angle||square)continue;const time=times[index];if(time?.length>=2)visible.push({char,start:Number(time[0]),end:Number(time[1])});}
  const aligned:Array<{char:string;start:number;end:number}>=[];let cursor=0;for(const char of Array.from(dialogue)){let found=-1;for(let index=cursor;index<Math.min(visible.length,cursor+20);index++){if(visible[index].char===char){found=index;break;}}if(found>=0){aligned.push(visible[found]);cursor=found+1;}}
  if(!aligned.length)return [];
  const cues:Array<{text:string;start:number;end:number}>=[];let chunk:typeof aligned=[];let spoken=0;
  for(const item of aligned){chunk.push(item);if(!/[\s，。！？、…,.!?]/.test(item.char))spoken++;if(/[。！？!?]/.test(item.char)||spoken>=12){cues.push({text:chunk.map((part)=>part.char).join("").trim(),start:chunk[0].start,end:chunk.at(-1)!.end});chunk=[];spoken=0;}}
  if(chunk.length)cues.push({text:chunk.map((part)=>part.char).join("").trim(),start:chunk[0].start,end:chunk.at(-1)!.end});return cues.filter((cue)=>cue.text);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI 配音服务尚未配置" }, { status: 500 });
  const supabase = await createServerSupabaseClient();
  const { id } = await params;
  let eventId = "";
  try {
    const body = (await request.json()) as { voiceId?: string; fallbackVoiceId?: string; language?: string; speed?: number; batch?: boolean };
    const language = languages.has(body.language ?? "") ? body.language! : "zh";
    const { data: shot, error: shotError } = await supabase.from("storyboard_shots").select("id,project_id,dialogue,duration_seconds,action,sound,character_names,speaker_character_id,media_status,video_url").eq("id", id).eq("user_id", user.id).single();
    if (shotError || !shot) throw new Error("未找到这个分镜");
    const text = String(shot.dialogue ?? "").trim();
    if (!text) return NextResponse.json({ error: "这个镜头没有对白或旁白" }, { status: 400 });
    const performanceContext = `${String(shot.action ?? "")} ${String(shot.sound ?? "")} ${(shot.character_names ?? []).join(" ")}`;
    const likelyFemale = /苏雨晴|女孩|少女|女人|女性|女主|她/.test(performanceContext) && !shot.speaker_character_id;
    const voiceId = voices.has(body.voiceId ?? "") ? body.voiceId! : likelyFemale ? "eve" : voices.has(body.fallbackVoiceId ?? "") ? body.fallbackVoiceId! : "rex";
    const whispering = /微弱|虚弱|低声|耳语|气若游丝|屏息/.test(performanceContext);
    const urgent = /惊恐|恐惧|急促|大喊|冲向|警告|追赶|崩溃|警戒|紧绷|保护|危险|怪物|丧尸/.test(performanceContext) || /！|!/.test(text);
    const grieving = /哭|哽咽|悲伤|失去|绝望/.test(performanceContext);
    const angry = /愤怒|暴怒|咆哮|怒吼|质问|仇恨/.test(performanceContext);
    const intensity = Math.min(5, Math.max(1, Number(performanceContext.match(/(?:强度|intensity)\s*[:：]?\s*([1-5])/i)?.[1] ?? 2)));
    const naturalSpeed = grieving ? 0.88 : whispering ? 0.92 : angry ? 1 + intensity * 0.012 : urgent ? 1 + intensity * 0.016 : 0.98;
    const speed = Math.min(1.3, Math.max(0.7, Number(body.speed ?? naturalSpeed)));
    const frightened = /惊恐|恐惧|害怕|颤抖|危险|怪物|丧尸/.test(performanceContext);
    const relieved = /松了口气|如释重负|终于安全|得救/.test(performanceContext);
    const laughing = /笑|大笑|轻笑|开心|兴奋/.test(performanceContext);
    const punctuatedText = urgent ? text.replace(/[。.]$/u, "！") : grieving ? text.replace(/，/g, "……") : text;
    let expressiveText = punctuatedText;
    if (whispering) expressiveText = `<whisper><soft>${expressiveText}</soft></whisper>`;
    else if (angry) expressiveText = `<build-intensity><loud>${expressiveText}</loud></build-intensity>`;
    else if (grieving) expressiveText = `[sigh] <slow><soft>${expressiveText}</soft></slow> [cry]`;
    else if (frightened) expressiveText = `[inhale] <higher-pitch>${expressiveText}</higher-pitch> [breath]`;
    else if (relieved) expressiveText = `[exhale] <soft>${expressiveText}</soft>`;
    else if (laughing) expressiveText = `[chuckle] <laugh-speak>${expressiveText}</laugh-speak>`;
    else if (/……|…/.test(expressiveText)) expressiveText = expressiveText.replace(/……|…/g, " [long-pause] ");
    if (intensity >= 4 && !whispering && !grieving) expressiveText = `<build-intensity>${expressiveText}</build-intensity>`;
    const usage = await reserveUsage(user.id, "audio", body.batch === true); eventId = usage.eventId;
    const response = await fetch("https://api.x.ai/v1/tts", {
      method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text: expressiveText, voice_id: voiceId, language, speed, text_normalization: true, optimize_streaming_latency: 0, with_timestamps: true, output_format: { codec: "mp3", sample_rate: 44100, bit_rate: 192000 } }), cache: "no-store",
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(detail.slice(0, 300) || "xAI 配音生成失败");
    }
    const payload = await response.json() as { audio?: string; duration?: number; content_type?: string; audio_timestamps?: AudioTimestamps };
    if (!payload.audio) throw new Error("xAI 配音返回内容为空");
    const path = `${user.id}/${shot.project_id}/${shot.id}.mp3`;
    const audio = Uint8Array.from(Buffer.from(payload.audio, "base64"));
    const { error: uploadError } = await supabase.storage.from("storyboard-audio").upload(path, audio, { contentType: "audio/mpeg", upsert: true });
    if (uploadError) throw uploadError;
    const timingsPath = `${user.id}/${shot.project_id}/${shot.id}.timings.json`;
    const timings = new TextEncoder().encode(JSON.stringify({ version: 1, cues: captionCues(text, payload.audio_timestamps) }));
    await supabase.storage.from("storyboard-audio").upload(timingsPath, timings, { contentType: "audio/mpeg", upsert: true });
    const audioUrl = supabase.storage.from("storyboard-audio").getPublicUrl(path).data.publicUrl;
    const { data: projectShots } = await supabase.from("storyboard_shots").select("id,duration_seconds,shot_number").eq("project_id", shot.project_id).eq("user_id", user.id).order("shot_number");
    let startMs = 0;
    for (const item of projectShots ?? []) { if (item.id === shot.id) break; startMs += Number(item.duration_seconds ?? 5) * 1000; }
    const audioDuration = Math.max(0, Number(payload.duration ?? 0));
    const matchedDuration = Math.min(15, Math.max(2, Math.ceil(audioDuration + 0.35)));
    const endMs = startMs + Math.round(audioDuration * 1000);
    const updates: Record<string, unknown> = { audio_url: audioUrl, voice_id: voiceId, voice_language: language, duration_seconds: matchedDuration, subtitle_start_ms: startMs, subtitle_end_ms: endMs };
    if (shot.media_status === "lipsync_ready") {
      const sourceVideo = await originalVideoUrl(supabase, user.id, shot.project_id, shot.id);
      Object.assign(updates, { video_url: sourceVideo, media_status: sourceVideo ? "completed" : "pending", error_message: null });
    }
    const { data: updated, error: updateError } = await supabase.from("storyboard_shots").update(updates).eq("id", shot.id).eq("user_id", user.id).select("*").single();
    if (updateError) throw updateError;
    const credits = await finishUsage(user.id, eventId, true);
    return NextResponse.json({ shot: updated, credits });
  } catch (error) {
    if (eventId) await finishUsage(user.id, eventId, false).catch(() => undefined);
    return NextResponse.json({ error: error instanceof Error ? error.message : "配音生成失败" }, { status: 500 });
  }
}
