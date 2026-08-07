import { NextResponse } from "next/server";
import { getCurrentUser } from "@/app/lib/auth";
import { createServerSupabaseClient } from "@/app/lib/supabaseServer";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: shot } = await supabase.from("storyboard_shots").select("audio_url").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!shot?.audio_url) return NextResponse.json({ error: "这个镜头还没有配音" }, { status: 404 });
  const response = await fetch(shot.audio_url, { cache: "no-store" });
  if (!response.ok) return NextResponse.json({ error: "读取配音失败" }, { status: 502 });
  return new NextResponse(await response.arrayBuffer(), { headers: { "Content-Type": response.headers.get("content-type") || "audio/mpeg", "Cache-Control": "private, no-store" } });
}
