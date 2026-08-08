import { NextResponse } from "next/server";
import { getCurrentUser } from "@/app/lib/auth";
import { createServerSupabaseClient } from "@/app/lib/supabaseServer";
import { finishUsage, reserveUsage } from "@/app/lib/usage";
import { charactersPrompt, getCharacters } from "@/app/lib/characters";

type GenerateBody = { provider?: "xai" | "kling"; prompt?: string; image?: string; duration?: number; aspectRatio?: string; resolution?: string; conversationId?: string; characterId?: string; characterIds?: string[]; batch?: boolean };

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录后再生成视频" }, { status: 401 });
  const supabase = await createServerSupabaseClient();
  let eventId = "";
  try {
    const body = (await request.json()) as GenerateBody;
    const prompt = body.prompt?.trim();
    const duration = Number(body.duration ?? 5);
    const resolution = body.resolution === "720p" ? "720p" : "480p";
    if (!prompt) return NextResponse.json({ error: "请输入视频提示词" }, { status: 400 });
    if (!Number.isInteger(duration) || duration < 1 || duration > 15) return NextResponse.json({ error: "视频时长必须为 1—15 秒" }, { status: 400 });
    if (body.resolution && !["480p","720p"].includes(body.resolution)) return NextResponse.json({ error: "视频清晰度只支持 480p 或 720p" }, { status: 400 });
    if (body.provider === "kling") return NextResponse.json({ error: "Kling 通道正在维护，请使用 xAI 视频" }, { status: 503 });
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "AI 视频服务尚未配置" }, { status: 500 });
    let conversationId = body.conversationId;
    if (!conversationId) {
      const { data, error } = await supabase.from("conversations").insert({ user_id: user.id, title: prompt.slice(0, 36), mode: "video" }).select("id").single();
      if (error) throw error; conversationId = data.id;
    }
    const usage = await reserveUsage(user.id, "video", body.batch === true, resolution === "720p" ? 112 : 80); eventId = usage.eventId;
    await supabase.from("messages").insert({ conversation_id: conversationId, user_id: user.id, role: "user", content: prompt });
    const characters = await getCharacters(user.id, body.characterIds?.length ? body.characterIds : body.characterId ? [body.characterId] : []);
    const requestBody: Record<string, unknown> = { model: "grok-imagine-video", prompt: prompt + charactersPrompt(characters), duration, aspect_ratio: body.aspectRatio ?? "9:16", resolution };
    if (body.image) requestBody.image = { url: body.image };
    else if (duration <= 10) {
      const references = [...new Set(characters.flatMap((character) => [character.images?.front, character.images?.full, character.images?.left, character.images?.right]).filter((url): url is string => Boolean(url)))].slice(0, 7);
      if (references.length) requestBody.reference_images = references.map((url) => ({ url }));
    }
    const response = await fetch("https://api.x.ai/v1/videos/generations", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify(requestBody), cache: "no-store" });
    const rawResponse = await response.text();
    let data: Record<string, unknown> = {};
    try { data = rawResponse ? JSON.parse(rawResponse) as Record<string, unknown> : {}; } catch { data = {}; }
    if (!response.ok) {
      const providerError = data.error;
      const detail = typeof providerError === "string"
        ? providerError
        : providerError && typeof providerError === "object" && "message" in providerError
          ? String(providerError.message)
          : typeof data.message === "string"
            ? data.message
            : rawResponse.slice(0, 300);
      throw new Error(`xAI 视频请求失败（${response.status}）${detail ? `：${detail}` : ""}`);
    }
    const requestId = data.request_id;
    if (!requestId) throw new Error("视频服务未返回任务 ID");
    const { data: work, error: workError } = await supabase.from("works").insert({ user_id: user.id, conversation_id: conversationId, type: "video", prompt, status: "processing", provider_task_id: requestId, usage_event_id: eventId }).select("id").single();
    if (workError) throw workError;
    return NextResponse.json({ provider: "xai", requestId, taskId: requestId, status: "submitted", conversationId, workId: work.id, credits: usage.credits, resolution });
  } catch (error) {
    if (eventId) await finishUsage(user.id, eventId, false).catch(() => undefined);
    return NextResponse.json({ error: error instanceof Error ? error.message : "视频生成服务发生错误" }, { status: 500 });
  }
}
