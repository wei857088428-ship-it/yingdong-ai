import { NextResponse } from "next/server";
import { getCurrentUser } from "@/app/lib/auth";

type SoundResult = { audio_url?: string; name?: string; description?: string; score?: number };

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const apiKey = process.env.HEYGEN_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "HeyGen 服务尚未配置" }, { status: 503 });
  const url = new URL(request.url); const type = url.searchParams.get("type") === "sound_effects" ? "sound_effects" : "music"; const query = url.searchParams.get("query")?.trim() ?? "";
  if (query.length < 4 || query.length > 600) return NextResponse.json({ error: "音效描述长度必须为 4—600 字" }, { status: 400 });
  const search = new URL("https://api.heygen.com/v3/audio/sounds"); search.searchParams.set("query", query); search.searchParams.set("type", type); search.searchParams.set("limit", "1"); search.searchParams.set("min_score", "0.72");
  try {
    const response = await fetch(search, { headers: { "X-Api-Key": apiKey }, cache: "no-store", signal: AbortSignal.timeout(30_000) });
    const payload = await response.json().catch(() => ({})) as { data?: SoundResult[]; error?: { message?: string } | string; message?: string };
    if (!response.ok) return NextResponse.json({ error: typeof payload.error === "object" ? payload.error?.message : payload.error || payload.message || "搜索配乐失败" }, { status: response.status });
    const sound = payload.data?.[0]; if (!sound?.audio_url) return NextResponse.json({ error: "没有找到匹配的配乐" }, { status: 404 });
    const target = new URL(sound.audio_url); const allowed = target.protocol === "https:" && (target.hostname === "heygen-product.s3-accelerate.amazonaws.com" || target.hostname.endsWith(".heygen.ai"));
    if (!allowed) return NextResponse.json({ error: "配乐地址不受信任" }, { status: 502 });
    const audio = await fetch(target, { cache: "no-store", signal: AbortSignal.timeout(60_000) });
    if (!audio.ok || !audio.body) return NextResponse.json({ error: `读取配乐失败 (${audio.status})` }, { status: 502 });
    return new NextResponse(audio.body, { headers: { "Content-Type": audio.headers.get("content-type") || "audio/wav", "Cache-Control": "private, no-store", "X-Sound-Name": encodeURIComponent(sound.name || sound.description || type), "X-Sound-Score": String(sound.score ?? "") } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "配乐服务发生错误" }, { status: 502 });
  }
}
