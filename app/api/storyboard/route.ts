import { NextResponse } from "next/server";
import { getCurrentUser } from "@/app/lib/auth";
import { supabaseAdmin } from "@/app/lib/supabaseAdmin";
import { finishUsage, reserveUsage } from "@/app/lib/usage";

type Shot = { shot_number: number; duration_seconds: number; shot_type: string; camera: string; scene: string; action: string; dialogue: string; sound: string; image_prompt: string; video_prompt: string };

function parseJson(text: string) {
  const cleaned = text.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  const start = cleaned.indexOf("{"); const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("AI 未返回有效分镜结构，请重试");
  return JSON.parse(cleaned.slice(start, end + 1)) as { title?: string; shots?: Shot[] };
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  let eventId = "";
  try {
    const body = (await request.json()) as { title?: string; story?: string; shotCount?: number };
    const story = body.story?.trim(); const shotCount = Math.min(30, Math.max(6, Number(body.shotCount ?? 12)));
    if (!story || story.length < 30) return NextResponse.json({ error: "请粘贴至少30字的小说或剧情" }, { status: 400 });
    const apiKey = process.env.XAI_API_KEY; if (!apiKey) throw new Error("AI 服务尚未配置");
    const usage = await reserveUsage(user.id, "chat"); eventId = usage.eventId;
    const response = await fetch("https://api.x.ai/v1/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, cache: "no-store", body: JSON.stringify({ model: "grok-4.5", temperature: 0.35, messages: [{ role: "system", content: `你是专业竖屏漫剧导演。把用户故事拆成${shotCount}个连续、可直接制作的镜头。只返回JSON对象，不要Markdown。结构：{"title":"集名","shots":[{"shot_number":1,"duration_seconds":5,"shot_type":"近景","camera":"缓慢推进","scene":"场景与构图","action":"角色动作与情绪","dialogue":"对白或旁白","sound":"音效与音乐","image_prompt":"详细中文图片提示词，9:16，包含角色、景别、构图、光线，禁止文字水印","video_prompt":"详细图生视频动作与运镜提示词"}]}。保持角色、服装、场景与时间连续；开头3秒有钩子，结尾有悬念。` }, { role: "user", content: story }] }) });
    const result = await response.json(); if (!response.ok) throw new Error(result?.error?.message ?? "分镜生成失败");
    const parsed = parseJson(result?.choices?.[0]?.message?.content ?? "");
    const shots = (parsed.shots ?? []).slice(0, shotCount).map((shot, index) => ({ ...shot, shot_number: index + 1, duration_seconds: Math.min(15, Math.max(2, Number(shot.duration_seconds ?? 5))) }));
    if (!shots.length) throw new Error("没有生成分镜，请重试");
    const { data: project, error: projectError } = await supabaseAdmin.from("storyboard_projects").insert({ user_id: user.id, title: parsed.title || body.title?.trim() || "未命名漫剧", source_text: story }).select("id,title,created_at").single();
    if (projectError) throw projectError;
    const { data: savedShots, error: shotError } = await supabaseAdmin.from("storyboard_shots").insert(shots.map((shot) => ({ ...shot, project_id: project.id, user_id: user.id }))).select("*").order("shot_number");
    if (shotError) throw shotError;
    const credits = await finishUsage(user.id, eventId, true);
    return NextResponse.json({ project, shots: savedShots, credits });
  } catch (error) {
    if (eventId) await finishUsage(user.id, eventId, false).catch(() => undefined);
    return NextResponse.json({ error: error instanceof Error ? error.message : "拆分镜失败" }, { status: 500 });
  }
}

export async function GET() {
  const user = await getCurrentUser(); if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const { data } = await supabaseAdmin.from("storyboard_projects").select("id,title,created_at,storyboard_shots(*)").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10);
  return NextResponse.json({ projects: data ?? [] });
}
