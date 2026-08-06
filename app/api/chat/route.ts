import { NextResponse } from "next/server";
import { getCurrentUser } from "@/app/lib/auth";
import { supabaseAdmin } from "@/app/lib/supabaseAdmin";
import { finishUsage, reserveUsage } from "@/app/lib/usage";

type ChatMessage = { role: "user" | "assistant"; content: string };

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录后再使用 AI 对话" }, { status: 401 });
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI 服务尚未配置" }, { status: 500 });
  let eventId = "";
  try {
    const body = (await request.json()) as { messages?: ChatMessage[]; conversationId?: string };
    const messages = (body.messages ?? []).filter((item) => item?.content?.trim()).slice(-20);
    if (!messages.length) return NextResponse.json({ error: "请输入问题" }, { status: 400 });
    let conversationId = body.conversationId;
    if (conversationId) {
      const { data } = await supabaseAdmin.from("conversations").select("id").eq("id", conversationId).eq("user_id", user.id).maybeSingle();
      if (!data) conversationId = undefined;
    }
    if (!conversationId) {
      const { data, error } = await supabaseAdmin.from("conversations").insert({ user_id: user.id, title: messages.at(-1)!.content.slice(0, 36), mode: "chat" }).select("id").single();
      if (error) throw error;
      conversationId = data.id;
    }
    const usage = await reserveUsage(user.id, "chat"); eventId = usage.eventId;
    const userMessage = messages.at(-1)!;
    await supabaseAdmin.from("messages").insert({ conversation_id: conversationId, user_id: user.id, role: "user", content: userMessage.content });
    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "grok-4.5", messages: [{ role: "system", content: "你是影动 AI 的资深漫剧导演、编剧和分镜师。你擅长60—90秒竖屏漫剧、前三秒钩子、情绪冲突、结尾反转、角色圣经、连续分镜和图生视频提示词。回答要专业、可直接制作；剧本优先使用【场景】【画面】【动作】【台词】【音效】结构，分镜优先使用表格，并主动提醒用户保持角色外貌、服装、场景和光线一致。除非用户要求其他语言，否则使用简洁中文。" }, ...messages], temperature: 0.7 }), cache: "no-store",
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error?.message ?? "AI 对话暂时不可用");
    const content = data?.choices?.[0]?.message?.content ?? "暂时没有生成内容，请重试。";
    const credits = await finishUsage(user.id, eventId, true);
    await Promise.all([
      supabaseAdmin.from("messages").insert({ conversation_id: conversationId, user_id: user.id, role: "assistant", content }),
      supabaseAdmin.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId).eq("user_id", user.id),
    ]);
    return NextResponse.json({ content, conversationId, credits });
  } catch (error) {
    if (eventId) await finishUsage(user.id, eventId, false).catch(() => undefined);
    return NextResponse.json({ error: error instanceof Error ? error.message : "AI 对话服务发生错误" }, { status: 500 });
  }
}
