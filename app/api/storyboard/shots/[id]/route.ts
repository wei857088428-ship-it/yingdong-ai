import { NextResponse } from "next/server";
import { getCurrentUser } from "@/app/lib/auth";
import { createServerSupabaseClient } from "@/app/lib/supabaseServer";

const allowed = ["pending", "image_generating", "image_ready", "video_generating", "completed", "failed"];
const templates = {
  closeup: { shotType: "特写", camera: "缓慢推进", image: "面部特写，突出眼神与细微表情，浅景深，主体居中", video: "镜头缓慢推进至面部特写，保留细微表情变化" },
  near: { shotType: "近景", camera: "轻微推近", image: "胸部以上近景，突出人物动作和情绪，电影感构图", video: "从稳定近景轻微推近，跟随人物上半身动作" },
  medium: { shotType: "中景", camera: "平稳跟拍", image: "膝部以上中景，同时交代人物动作与周围环境", video: "中景平稳跟拍，保持人物和场景空间关系清晰" },
  wide: { shotType: "远景", camera: "缓慢拉远", image: "远景全貌，建立场景空间、人物位置与环境氛围", video: "从场景全貌缓慢拉远，展示环境规模与人物位置" },
} as const;

function applyPromptTemplate(prompt: string, label: string, instruction: string) {
  const clean = prompt.replace(/^\[镜头模板:[^\]]+\]\s*[^。]+。\s*/u, "");
  return `[镜头模板:${label}] ${instruction}。${clean}`.slice(0, 8000);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser(); if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const { id } = await params; const body = (await request.json()) as { imageUrl?: string; videoUrl?: string; status?: string; error?: string; characterIds?: string[] | null; shotTemplate?: keyof typeof templates };
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
  const { data, error } = await supabase.from("storyboard_shots").update(updates).eq("id", id).eq("user_id", user.id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ shot: data });
}
