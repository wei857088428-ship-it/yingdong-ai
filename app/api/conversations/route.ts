import { NextResponse } from "next/server";
import { getCurrentUser } from "@/app/lib/auth";
import { createServerSupabaseClient } from "@/app/lib/supabaseServer";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const supabase = await createServerSupabaseClient();
  const [{ data: conversations, error }, { data: works }] = await Promise.all([
    supabase.from("conversations").select("id,title,mode,created_at,updated_at").eq("user_id", user.id).order("updated_at", { ascending: false }).limit(30),
    supabase.from("works").select("id,type,prompt,url,status,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(30),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ conversations: conversations ?? [], works: works ?? [] });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const supabase = await createServerSupabaseClient();
  const body = (await request.json()) as { title?: string; mode?: string };
  const mode = ["chat", "image", "video"].includes(body.mode ?? "") ? body.mode : "chat";
  const { data, error } = await supabase.from("conversations").insert({ user_id: user.id, title: body.title?.trim().slice(0, 60) || "新对话", mode }).select("id,title,mode,created_at,updated_at").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ conversation: data });
}
