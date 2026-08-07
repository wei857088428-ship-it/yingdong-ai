import { NextResponse } from "next/server";
import { getCurrentUser } from "@/app/lib/auth";
import { createServerSupabaseClient } from "@/app/lib/supabaseServer";
import { finishUsage, reserveUsage } from "@/app/lib/usage";
import { charactersPrompt, getCharacters } from "@/app/lib/characters";

type ReferenceCharacter = { images?: { front?: string; full?: string; left?: string; right?: string } };

function selectReferenceImages(previousImage: string | undefined, characters: ReferenceCharacter[], styleImage?: string) {
  const primary = characters.map((character) => character.images?.front || character.images?.full || character.images?.left || character.images?.right).filter((url): url is string => Boolean(url));
  const selected = [...new Set([previousImage, ...primary, styleImage].filter((url): url is string => Boolean(url)))].slice(0, 3);
  if (characters.length === 1 && selected.length < 3) {
    const extra = [characters[0].images?.full, characters[0].images?.left, characters[0].images?.right].filter((url): url is string => Boolean(url));
    for (const url of extra) if (!selected.includes(url) && selected.length < 3) selected.push(url);
  }
  return selected;
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录后再生成图片" }, { status: 401 });
  const supabase = await createServerSupabaseClient();
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI 服务尚未配置" }, { status: 500 });
  let eventId = "";
  try {
    const body = (await request.json()) as { prompt?: string; aspectRatio?: string; conversationId?: string; characterId?: string; characterIds?: string[]; referenceImage?: string; styleImage?: string; referenceMode?: "scene" | "identity"; batch?: boolean };
    const prompt = body.prompt?.trim();
    if (!prompt) return NextResponse.json({ error: "请输入图片描述" }, { status: 400 });
    let conversationId = body.conversationId;
    if (!conversationId) {
      const { data, error } = await supabase.from("conversations").insert({ user_id: user.id, title: prompt.slice(0, 36), mode: "image" }).select("id").single();
      if (error) throw error; conversationId = data.id;
    }
    const usage = await reserveUsage(user.id, "image", body.batch === true); eventId = usage.eventId;
    await supabase.from("messages").insert({ conversation_id: conversationId, user_id: user.id, role: "user", content: prompt });
    const characters = await getCharacters(user.id, body.characterIds?.length ? body.characterIds : body.characterId ? [body.characterId] : []);
    const finalPrompt = prompt + charactersPrompt(characters);
    const referenceImages = selectReferenceImages(body.referenceImage, characters, body.styleImage);
    const environmentRule = body.referenceMode === "identity"
      ? "上一镜只用于继承人物身份、服装、伤势、随身道具与整体美术风格；当前提示词要求了新地点，因此必须自然切换到当前场景，不要复制上一镜背景。"
      : "如果包含上一镜画面，同时保持场景布局、道具位置、人物站位、光线方向与色调。";
    const styleRule = body.styleImage && referenceImages.includes(body.styleImage) ? "本集风格参考图只用于继承画风、线条质感、色彩处理和渲染精度，不得复制其中的人物身份、动作、构图或背景。" : "";
    const continuityPrompt = referenceImages.length ? `${finalPrompt}\n\n视觉参考图是硬性身份与连续性约束：严格复用参考人物的脸型、五官、发型、服装、体型和身份。${environmentRule}${styleRule}只改变当前镜头要求的动作、表情和机位，不得重新设计人物，不得增加陌生人。` : finalPrompt;
    const editInput = referenceImages.length === 1
      ? { image: { url: referenceImages[0], type: "image_url" } }
      : { images: referenceImages.map((url) => ({ url, type: "image_url" })) };
    const response = await fetch(referenceImages.length ? "https://api.x.ai/v1/images/edits" : "https://api.x.ai/v1/images/generations", {
      method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(referenceImages.length
        ? { model: "grok-imagine-image-quality", prompt: continuityPrompt, ...editInput, aspect_ratio: body.aspectRatio }
        : { model: "grok-imagine-image-quality", prompt: continuityPrompt, n: 1, aspect_ratio: body.aspectRatio }), cache: "no-store",
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error?.message ?? "图片生成失败");
    const imageUrl = data?.data?.[0]?.url;
    if (!imageUrl) throw new Error("图片已生成，但未返回图片地址");
    const credits = await finishUsage(user.id, eventId, true);
    const content = "图片已经生成，可以打开或下载保存。";
    await Promise.all([
      supabase.from("messages").insert({ conversation_id: conversationId, user_id: user.id, role: "assistant", content, media_url: imageUrl, media_type: "image" }),
      supabase.from("works").insert({ user_id: user.id, conversation_id: conversationId, type: "image", prompt, url: imageUrl, status: "completed" }),
      supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId).eq("user_id", user.id),
    ]);
    return NextResponse.json({ imageUrl, conversationId, credits });
  } catch (error) {
    if (eventId) await finishUsage(user.id, eventId, false).catch(() => undefined);
    return NextResponse.json({ error: error instanceof Error ? error.message : "图片生成服务发生错误" }, { status: 500 });
  }
}
