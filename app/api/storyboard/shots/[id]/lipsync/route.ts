import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/app/lib/auth";
import { createServerSupabaseClient } from "@/app/lib/supabaseServer";

const HEYGEN_URL = "https://api.heygen.com/v3/lipsyncs";

function messageOf(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback;
  const value = payload as Record<string, unknown>;
  return String(value.message ?? value.error ?? value.detail ?? fallback).slice(0, 500);
}

function dataOf(payload: unknown) {
  if (!payload || typeof payload !== "object") return {} as Record<string, unknown>;
  const value = payload as Record<string, unknown>;
  return value.data && typeof value.data === "object" ? value.data as Record<string, unknown> : value;
}

async function ownedShot(id: string, userId: string) {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.from("storyboard_shots").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
  return { supabase, shot: data };
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const apiKey = process.env.HEYGEN_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "HeyGen 服务尚未配置" }, { status: 503 });

  const { id } = await params;
  const body = await request.json().catch(() => ({})) as { mode?: string; paddedAudioBase64?: string };
  const { supabase, shot } = await ownedShot(id, user.id);
  if (!shot) return NextResponse.json({ error: "未找到这个镜头" }, { status: 404 });
  if (!shot.video_url || !shot.audio_url) return NextResponse.json({ error: "请先生成视频和配音" }, { status: 400 });

  const distantShot = /远景|全景|空镜/.test(String(shot.shot_type ?? ""));
  const intensePerformance = /强度\s*[:：]?\s*[4-5]|大喊|哭|愤怒|惊恐/.test(`${String(shot.sound ?? "")} ${String(shot.action ?? "")}`);
  const mode = body.mode === "speed" || body.mode === "precision" ? body.mode : !distantShot || intensePerformance ? "precision" : "speed";
  let audioUrl = String(shot.audio_url);
  if (body.paddedAudioBase64) {
    const encoded = body.paddedAudioBase64.replace(/^data:audio\/wav;base64,/, "");
    const audio = Buffer.from(encoded, "base64");
    if (!audio.length || audio.length > 12_000_000) return NextResponse.json({ error: "口型同步音频无效或过大" }, { status: 400 });
    // The existing storyboard-audio bucket is configured for MPEG audio. Keep
    // the .wav filename so HeyGen can detect the actual PCM container, while
    // using the bucket-compatible content type. A unique name also avoids the
    // storage update policy and stale CDN copies from previous attempts.
    const path = `${user.id}/${shot.project_id}/${shot.id}.${Date.now()}.lipsync.wav`;
    const { error: uploadError } = await supabase.storage.from("storyboard-audio").upload(path, audio, { contentType: "audio/mpeg", upsert: false });
    if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });
    audioUrl = supabase.storage.from("storyboard-audio").getPublicUrl(path).data.publicUrl;
  }
  await supabase.from("storyboard_shots").update({ media_status: "lipsync_generating", error_message: null }).eq("id", id).eq("user_id", user.id);

  const response = await fetch(HEYGEN_URL, {
    method: "POST",
    headers: { "X-Api-Key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      video: { type: "url", url: shot.video_url },
      audio: { type: "url", url: audioUrl },
      mode,
      title: `影动AI · 镜头 ${shot.shot_number}`,
      enable_dynamic_duration: true,
      enable_caption: false,
      disable_music_track: true,
      keep_the_same_format: true,
      fps_mode: "passthrough",
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = messageOf(payload, "HeyGen 口型同步创建失败");
    await supabase.from("storyboard_shots").update({ media_status: "failed", error_message: error }).eq("id", id).eq("user_id", user.id);
    return NextResponse.json({ error }, { status: response.status });
  }
  const data = dataOf(payload);
  const jobId = String(data.id ?? data.lipsync_id ?? data.job_id ?? "");
  if (!jobId) return NextResponse.json({ error: "HeyGen 未返回任务编号" }, { status: 502 });
  return NextResponse.json({ jobId, mode });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const apiKey = process.env.HEYGEN_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "HeyGen 服务尚未配置" }, { status: 503 });
  const jobId = request.nextUrl.searchParams.get("jobId")?.trim();
  if (!jobId || !/^[\w-]{4,160}$/.test(jobId)) return NextResponse.json({ error: "口型同步任务编号无效" }, { status: 400 });

  const { id } = await params;
  const { supabase, shot } = await ownedShot(id, user.id);
  if (!shot) return NextResponse.json({ error: "未找到这个镜头" }, { status: 404 });
  const response = await fetch(`${HEYGEN_URL}/${encodeURIComponent(jobId)}`, { headers: { "X-Api-Key": apiKey }, cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) return NextResponse.json({ error: messageOf(payload, "查询 HeyGen 任务失败") }, { status: response.status });
  const data = dataOf(payload);
  const status = String(data.status ?? "processing").toLowerCase();
  const videoUrl = String(data.video_url ?? data.output_url ?? "");
  if (["completed", "complete", "done", "success"].includes(status) && videoUrl) {
    const completedDuration = Number(data.duration ?? 0);
    const updates: Record<string, unknown> = { video_url: videoUrl, media_status: "lipsync_ready", error_message: null };
    if (Number.isFinite(completedDuration) && completedDuration > 0) updates.duration_seconds = Math.max(1, Math.round(completedDuration));
    const { data: updated, error } = await supabase.from("storyboard_shots").update(updates).eq("id", id).eq("user_id", user.id).select("*").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ status: "completed", shot: updated });
  }
  if (["failed", "error", "canceled", "cancelled"].includes(status)) {
    const error = messageOf(data.failure ?? data, "HeyGen 口型同步失败");
    await supabase.from("storyboard_shots").update({ media_status: "failed", error_message: error }).eq("id", id).eq("user_id", user.id);
    return NextResponse.json({ status: "failed", error });
  }
  return NextResponse.json({ status: "processing" });
}
