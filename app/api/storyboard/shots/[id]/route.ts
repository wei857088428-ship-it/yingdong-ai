import { NextResponse } from "next/server";
import { getCurrentUser } from "@/app/lib/auth";
import { createServerSupabaseClient } from "@/app/lib/supabaseServer";

const allowed = ["pending", "image_generating", "image_ready", "video_generating", "completed", "failed"];

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser(); if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const { id } = await params; const body = (await request.json()) as { imageUrl?: string; videoUrl?: string; status?: string; error?: string; characterIds?: string[] | null };
  const updates: Record<string, string | string[] | null> = {};
  if (body.imageUrl) updates.image_url = body.imageUrl;
  if (body.videoUrl) updates.video_url = body.videoUrl;
  if (body.status && allowed.includes(body.status)) updates.media_status = body.status;
  if (body.error !== undefined) updates.error_message = body.error?.slice(0, 500) || null;
  const supabase = await createServerSupabaseClient();
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
