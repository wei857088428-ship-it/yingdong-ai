import { NextResponse } from "next/server";
import { getCurrentUser } from "@/app/lib/auth";

function allowedMediaHost(hostname: string) {
  const supabaseHost = (() => {
    try { return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname; }
    catch { return ""; }
  })();
  return hostname.endsWith(".x.ai") || hostname.endsWith(".heygen.ai") || hostname.endsWith(".heygen.com") || Boolean(supabaseHost && hostname === supabaseHost);
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const source = new URL(request.url).searchParams.get("url");
  if (!source) return NextResponse.json({ error: "缺少素材地址" }, { status: 400 });

  let target: URL;
  try { target = new URL(source); }
  catch { return NextResponse.json({ error: "素材地址无效" }, { status: 400 }); }
  if (target.protocol !== "https:" || !allowedMediaHost(target.hostname)) return NextResponse.json({ error: "不允许代理这个素材地址" }, { status: 403 });

  const upstream = await fetch(target, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(60_000) });
  if (!upstream.ok || !upstream.body) return NextResponse.json({ error: `素材读取失败 (${upstream.status})` }, { status: 502 });
  const headers = new Headers({
    "Content-Type": upstream.headers.get("content-type") ?? "application/octet-stream",
    "Cache-Control": "private, max-age=300",
  });
  const length = upstream.headers.get("content-length");
  if (length) headers.set("Content-Length", length);
  return new NextResponse(upstream.body, { headers });
}
