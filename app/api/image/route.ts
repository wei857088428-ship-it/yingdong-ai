import { NextResponse } from "next/server";
import { getCurrentUser } from "@/app/lib/auth";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录后再生成图片" }, { status: 401 });
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI 服务尚未配置" }, { status: 500 });

  try {
    const body = (await request.json()) as { prompt?: string; aspectRatio?: string };
    const prompt = body.prompt?.trim();
    if (!prompt) return NextResponse.json({ error: "请输入图片描述" }, { status: 400 });
    const response = await fetch("https://api.x.ai/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "grok-imagine-image-quality", prompt, n: 1 }),
      cache: "no-store",
    });
    const data = await response.json();
    if (!response.ok) return NextResponse.json({ error: data?.error?.message ?? "图片生成失败" }, { status: response.status });
    const imageUrl = data?.data?.[0]?.url;
    if (!imageUrl) return NextResponse.json({ error: "图片已生成，但未返回图片地址" }, { status: 502 });
    return NextResponse.json({ imageUrl });
  } catch (error) {
    console.error("Image API error:", error);
    return NextResponse.json({ error: "图片生成服务发生错误" }, { status: 500 });
  }
}
