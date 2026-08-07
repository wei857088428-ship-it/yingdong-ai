import { NextResponse } from "next/server";
import { getCurrentUser } from "@/app/lib/auth";
import { createServerSupabaseClient } from "@/app/lib/supabaseServer";
import { originalVideoUrl } from "@/app/lib/lipsyncSource";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: project, error } = await supabase.from("storyboard_projects").select("id,title,created_at,parent_project_id,character_id,storyboard_shots(*)").eq("id", id).eq("user_id", user.id).single();
  if (error || !project) return NextResponse.json({ error: "未找到这个分镜项目" }, { status: 404 });
  const includeSources = new URL(request.url).searchParams.get("includeSources") === "1";
  project.storyboard_shots = await Promise.all(project.storyboard_shots.toSorted((a, b) => a.shot_number - b.shot_number).map(async (shot) => ({
    ...shot,
    source_video_url: includeSources && shot.media_status === "lipsync_ready" ? await originalVideoUrl(supabase, user.id, project.id, shot.id) : null,
  })));
  return NextResponse.json({ project });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const { id } = await params;
  const body = (await request.json()) as { characterId?: string | null };
  const supabase = await createServerSupabaseClient();
  if (body.characterId) {
    const { data: character } = await supabase.from("characters").select("id").eq("id", body.characterId).eq("user_id", user.id).maybeSingle();
    if (!character) return NextResponse.json({ error: "未找到这个角色" }, { status: 404 });
  }
  const { data: project, error } = await supabase.from("storyboard_projects").update({ character_id: body.characterId || null }).eq("id", id).eq("user_id", user.id).select("id,character_id").single();
  if (error || !project) return NextResponse.json({ error: "保存角色绑定失败" }, { status: 500 });
  return NextResponse.json({ project });
}
