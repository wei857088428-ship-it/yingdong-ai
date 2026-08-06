import { NextResponse } from "next/server";
import { getCurrentUser } from "@/app/lib/auth";
import { createServerSupabaseClient } from "@/app/lib/supabaseServer";
import { finishUsage, reserveUsage } from "@/app/lib/usage";

const voices = new Set(["orion", "carina", "zagan", "luna", "iris", "altair", "perseus", "eve"]);
const languages = new Set(["zh", "en", "ja", "auto"]);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI 配音服务尚未配置" }, { status: 500 });
  const supabase = await createServerSupabaseClient();
  const { id } = await params;
  let eventId = "";
  try {
    const body = (await request.json()) as { voiceId?: string; language?: string; speed?: number; batch?: boolean };
    const voiceId = voices.has(body.voiceId ?? "") ? body.voiceId! : "orion";
    const language = languages.has(body.language ?? "") ? body.language! : "zh";
    const speed = Math.min(1.5, Math.max(0.7, Number(body.speed ?? 1)));
    const { data: shot, error: shotError } = await supabase.from("storyboard_shots").select("id,project_id,dialogue,duration_seconds").eq("id", id).eq("user_id", user.id).single();
    if (shotError || !shot) throw new Error("未找到这个分镜");
    const text = String(shot.dialogue ?? "").trim();
    if (!text) return NextResponse.json({ error: "这个镜头没有对白或旁白" }, { status: 400 });
    const usage = await reserveUsage(user.id, "audio", body.batch === true); eventId = usage.eventId;
    const response = await fetch("https://api.x.ai/v1/tts", {
      method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice_id: voiceId, language, speed, output_format: { codec: "mp3", sample_rate: 24000, bit_rate: 128000 } }), cache: "no-store",
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(detail.slice(0, 300) || "xAI 配音生成失败");
    }
    const path = `${user.id}/${shot.project_id}/${shot.id}.mp3`;
    const audio = new Uint8Array(await response.arrayBuffer());
    const { error: uploadError } = await supabase.storage.from("storyboard-audio").upload(path, audio, { contentType: "audio/mpeg", upsert: true });
    if (uploadError) throw uploadError;
    const audioUrl = supabase.storage.from("storyboard-audio").getPublicUrl(path).data.publicUrl;
    const { data: projectShots } = await supabase.from("storyboard_shots").select("id,duration_seconds,shot_number").eq("project_id", shot.project_id).eq("user_id", user.id).order("shot_number");
    let startMs = 0;
    for (const item of projectShots ?? []) { if (item.id === shot.id) break; startMs += Number(item.duration_seconds ?? 5) * 1000; }
    const endMs = startMs + Number(shot.duration_seconds ?? 5) * 1000;
    const { data: updated, error: updateError } = await supabase.from("storyboard_shots").update({ audio_url: audioUrl, voice_id: voiceId, voice_language: language, subtitle_start_ms: startMs, subtitle_end_ms: endMs }).eq("id", shot.id).eq("user_id", user.id).select("*").single();
    if (updateError) throw updateError;
    const credits = await finishUsage(user.id, eventId, true);
    return NextResponse.json({ shot: updated, credits });
  } catch (error) {
    if (eventId) await finishUsage(user.id, eventId, false).catch(() => undefined);
    return NextResponse.json({ error: error instanceof Error ? error.message : "配音生成失败" }, { status: 500 });
  }
}
