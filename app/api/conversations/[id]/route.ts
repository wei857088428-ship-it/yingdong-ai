import { NextResponse } from "next/server";
import { getCurrentUser } from "@/app/lib/auth";
import { supabaseAdmin } from "@/app/lib/supabaseAdmin";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const { id } = await params;
  const { data: conversation } = await supabaseAdmin.from("conversations").select("id,title,mode").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!conversation) return NextResponse.json({ error: "对话不存在" }, { status: 404 });
  const { data: messages, error } = await supabaseAdmin.from("messages").select("role,content,media_url,media_type,created_at").eq("conversation_id", id).eq("user_id", user.id).order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ conversation, messages: messages ?? [] });
}
