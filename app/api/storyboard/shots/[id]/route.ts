import { NextResponse } from "next/server";
import { getCurrentUser } from "@/app/lib/auth";
import { createServerSupabaseClient } from "@/app/lib/supabaseServer";

const allowed = ["pending", "image_generating", "image_ready", "video_generating", "completed", "failed"];

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser(); if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const { id } = await params; const body = (await request.json()) as { imageUrl?: string; videoUrl?: string; status?: string; error?: string };
  const updates: Record<string, string | null> = {};
  if (body.imageUrl) updates.image_url = body.imageUrl;
  if (body.videoUrl) updates.video_url = body.videoUrl;
  if (body.status && allowed.includes(body.status)) updates.media_status = body.status;
  if (body.error !== undefined) updates.error_message = body.error?.slice(0, 500) || null;
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from("storyboard_shots").update(updates).eq("id", id).eq("user_id", user.id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ shot: data });
}
