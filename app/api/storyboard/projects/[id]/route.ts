import { NextResponse } from "next/server";
import { getCurrentUser } from "@/app/lib/auth";
import { createServerSupabaseClient } from "@/app/lib/supabaseServer";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: project, error } = await supabase.from("storyboard_projects").select("id,title,created_at,storyboard_shots(*)").eq("id", id).eq("user_id", user.id).single();
  if (error || !project) return NextResponse.json({ error: "未找到这个分镜项目" }, { status: 404 });
  project.storyboard_shots = project.storyboard_shots.toSorted((a, b) => a.shot_number - b.shot_number);
  return NextResponse.json({ project });
}
