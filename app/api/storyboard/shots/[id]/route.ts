import { NextResponse } from "next/server";
import { getCurrentUser } from "@/app/lib/auth";
import { createServerSupabaseClient } from "@/app/lib/supabaseServer";
import { originalVideoUrl } from "@/app/lib/lipsyncSource";
import { normalizeVoiceId } from "@/app/lib/voiceCatalog";

const allowed = ["pending", "image_generating", "image_ready", "video_generating", "lipsync_generating", "lipsync_ready", "completed", "failed"];
const templates = {
  closeup: { shotType: "特写", camera: "缓慢推进", image: "面部特写，突出眼神与细微表情，浅景深，主体居中", video: "镜头缓慢推进至面部特写，保留细微表情变化" },
  near: { shotType: "近景", camera: "轻微推近", image: "胸部以上近景，突出人物动作和情绪，电影感构图", video: "从稳定近景轻微推近，跟随人物上半身动作" },
  medium: { shotType: "中景", camera: "平稳跟拍", image: "膝部以上中景，同时交代人物动作与周围环境", video: "中景平稳跟拍，保持人物和场景空间关系清晰" },
  wide: { shotType: "远景", camera: "缓慢拉远", image: "远景全貌，建立场景空间、人物位置与环境氛围", video: "从场景全貌缓慢拉远，展示环境规模与人物位置" },
} as const;

const performancePresets = {
  tender: "温柔关切，强度2，语速偏慢，音量轻柔，句中自然停顿，潜台词是想让对方安心",
  nervous: "紧张不安，强度3，语速稍快，音量偏低，关键处短暂停顿，潜台词是害怕被发现",
  angry: "压抑愤怒，强度4，语速由慢转快，音量逐渐提高，重读关键字，潜台词是逼对方正面回应",
  grieving: "悲伤哽咽，强度4，语速缓慢，音量低，句前吸气并在转折处停顿，潜台词是不愿接受失去",
  determined: "坚定果断，强度4，语速稳定，音量清晰有力，结尾收紧，潜台词是已经作出不可动摇的决定",
} as const;

function applyPromptTemplate(prompt: string, label: string, instruction: string) {
  const clean = prompt.replace(/^\[镜头模板:[^\]]+\]\s*[^。]+。\s*/u, "");
  return `[镜头模板:${label}] ${instruction}。${clean}`.slice(0, 8000);
}

function applyPerformancePreset(sound: string, instruction: string) {
  const existing = String(sound ?? "").trim();
  const soundSection = existing.match(/；\s*(?:声音|环境声|动作音效)\s*[：:][\s\S]*$/)?.[0] ?? "";
  if (soundSection) return `表演：${instruction}${soundSection}`;
  if (/^(?:表演|情绪)\s*[：:]/.test(existing)) return `表演：${instruction}`;
  return `表演：${instruction}${existing ? `；声音：${existing}` : ""}`;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser(); if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const { id } = await params; const body = (await request.json()) as { imageUrl?: string; videoUrl?: string; status?: string; error?: string; characterIds?: string[] | null; speakerCharacterId?: string | null; shotTemplate?: keyof typeof templates; performancePreset?: keyof typeof performancePresets };
  const updates: Record<string, string | string[] | null> = {};
  if (body.imageUrl) updates.image_url = body.imageUrl;
  if (body.videoUrl) updates.video_url = body.videoUrl;
  if (body.status && allowed.includes(body.status)) updates.media_status = body.status;
  if (body.error !== undefined) updates.error_message = body.error?.slice(0, 500) || null;
  const supabase = await createServerSupabaseClient();
  if (body.shotTemplate && templates[body.shotTemplate]) {
    const { data: current } = await supabase.from("storyboard_shots").select("image_prompt,video_prompt").eq("id", id).eq("user_id", user.id).maybeSingle();
    if (!current) return NextResponse.json({ error: "未找到这个镜头" }, { status: 404 });
    const template = templates[body.shotTemplate];
    updates.shot_type = template.shotType; updates.camera = template.camera;
    updates.image_prompt = applyPromptTemplate(String(current.image_prompt ?? ""), template.shotType, template.image);
    updates.video_prompt = applyPromptTemplate(String(current.video_prompt ?? ""), template.shotType, template.video);
  }
  if (body.characterIds !== undefined) {
    if (body.characterIds === null) updates.character_ids = null;
    else {
      const ids = [...new Set(body.characterIds.filter(Boolean))].slice(0, 6);
      if (ids.length) {
        const { data: owned } = await supabase.from("characters").select("id").in("id", ids).eq("user_id", user.id);
        if ((owned ?? []).length !== ids.length) return NextResponse.json({ error: "镜头包含无效角色" }, { status: 400 });
      }
      updates.character_ids = ids;
    }
  }
  if (body.speakerCharacterId !== undefined) {
    if (body.speakerCharacterId) {
      const { data: speaker } = await supabase.from("characters").select("id,voice_id,voice_language").eq("id", body.speakerCharacterId).eq("user_id", user.id).maybeSingle();
      if (!speaker) return NextResponse.json({ error: "说话角色无效" }, { status: 400 });
      updates.speaker_character_id = speaker.id; updates.voice_id = normalizeVoiceId(speaker.voice_id); updates.voice_language = speaker.voice_language || "zh";
    } else updates.speaker_character_id = null;
    updates.audio_url = null; updates.subtitle_start_ms = null; updates.subtitle_end_ms = null; updates.error_message = null;
    const { data: current } = await supabase.from("storyboard_shots").select("media_status,project_id").eq("id", id).eq("user_id", user.id).maybeSingle();
    if (current?.media_status === "lipsync_ready") {
      const sourceVideo = await originalVideoUrl(supabase, user.id, current.project_id, id);
      updates.video_url = sourceVideo; updates.media_status = sourceVideo ? "completed" : "pending";
    }
  }
  if (body.performancePreset && performancePresets[body.performancePreset]) {
    const { data: current } = await supabase.from("storyboard_shots").select("sound,media_status,project_id").eq("id", id).eq("user_id", user.id).maybeSingle();
    if (!current) return NextResponse.json({ error: "未找到这个镜头" }, { status: 404 });
    updates.sound = applyPerformancePreset(String(current.sound ?? ""), performancePresets[body.performancePreset]);
    updates.audio_url = null; updates.subtitle_start_ms = null; updates.subtitle_end_ms = null; updates.error_message = null;
    if (current.media_status === "lipsync_ready") {
      const sourceVideo = await originalVideoUrl(supabase, user.id, current.project_id, id);
      updates.video_url = sourceVideo; updates.media_status = sourceVideo ? "completed" : "pending";
    }
  }
  const { data, error } = await supabase.from("storyboard_shots").update(updates).eq("id", id).eq("user_id", user.id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ shot: data });
}
