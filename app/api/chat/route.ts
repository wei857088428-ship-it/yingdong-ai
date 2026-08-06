import { NextResponse } from "next/server";
import { getCurrentUser } from "@/app/lib/auth";

type ChatMessage = { role: "user" | "assistant"; content: string };

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录后再使用 AI 对话" }, { status: 401 });
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI 服务尚未配置" }, { status: 500 });

  try {
    const body = (await request.json()) as { messages?: ChatMessage[] };
    const messages = (body.messages ?? []).filter((item) => item?.content?.trim()).slice(-20);
    if (!messages.length) return NextResponse.json({ error: "请输入问题" }, { status: 400 });
    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "grok-4.5", messages: [{ role: "system", content: "你是影动 AI，一位专业、直接、有创造力的中文 AI 助手，擅长漫剧、短视频、写作和视觉创作。" }, ...messages], temperature: 0.7 }),
      cache: "no-store",
    });
    const data = await response.json();
    if (!response.ok) return NextResponse.json({ error: data?.error?.message ?? "AI 对话暂时不可用" }, { status: response.status });
    return NextResponse.json({ content: data?.choices?.[0]?.message?.content ?? "暂时没有生成内容，请重试。" });
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json({ error: "AI 对话服务发生错误" }, { status: 500 });
  }
}
