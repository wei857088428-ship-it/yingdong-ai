import { NextResponse } from "next/server";
import { getCurrentUser } from "@/app/lib/auth";
import { supabaseAdmin } from "@/app/lib/supabaseAdmin";
import { finishUsage, reserveUsage } from "@/app/lib/usage";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录后再生成图片" }, { status: 401 });
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI 服务尚未配置" }, { status: 500 });
  let eventId = "";
  try {
    const body = (await request.json()) as { prompt?: string; aspectRatio?: string; conversationId?: string };
    const prompt = body.prompt?.trim();
    if (!prompt) return NextResponse.json({ error: "请输入图片描述" }, { status: 400 });
    let conversationId = body.conversationId;
    if (!conversationId) {
      const { data, error } = await supabaseAdmin.from("conversations").insert({ user_id: user.id, title: prompt.slice(0, 36), mode: "image" }).select("id").single();
      if (error) throw error; conversationId = data.id;
    }
    const usage = await reserveUsage(user.id, "image"); eventId = usage.eventId;
    await supabaseAdmin.from("messages").insert({ conversation_id: conversationId, user_id: user.id, role: "user", content: prompt });
    const response = await fetch("https://api.x.ai/v1/images/generations", {
      method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "grok-imagine-image-quality", prompt, n: 1, aspect_ratio: body.aspectRatio }), cache: "no-store",
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error?.message ?? "图片生成失败");
    const imageUrl = data?.data?.[0]?.url;
    if (!imageUrl) throw new Error("图片已生成，但未返回图片地址");
    const credits = await finishUsage(user.id, eventId, true);
    const content = "图片已经生成，可以打开或下载保存。";
    await Promise.all([
      supabaseAdmin.from("messages").insert({ conversation_id: conversationId, user_id: user.id, role: "assistant", content, media_url: imageUrl, media_type: "image" }),
      supabaseAdmin.from("works").insert({ user_id: user.id, conversation_id: conversationId, type: "image", prompt, url: imageUrl, status: "completed" }),
      supabaseAdmin.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId).eq("user_id", user.id),
    ]);
    return NextResponse.json({ imageUrl, conversationId, credits });
  } catch (error) {
    if (eventId) await finishUsage(user.id, eventId, false).catch(() => undefined);
    return NextResponse.json({ error: error instanceof Error ? error.message : "图片生成服务发生错误" }, { status: 500 });
  }
}
