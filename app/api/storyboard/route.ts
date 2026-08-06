import { NextResponse } from "next/server";
import { getCurrentUser } from "@/app/lib/auth";
import { createServerSupabaseClient } from "@/app/lib/supabaseServer";
import { finishUsage, reserveUsage } from "@/app/lib/usage";

type Shot = { shot_number: number; duration_seconds: number; shot_type: string; camera: string; scene: string; action: string; dialogue: string; sound: string; image_prompt: string; video_prompt: string; character_names: string[]; speaker_name: string };
type Character = { id: string; name: string; version: number };

const shotProperties = {
  shot_number: { type: "integer" },
  duration_seconds: { type: "integer", minimum: 2, maximum: 15 },
  shot_type: { type: "string" }, camera: { type: "string" }, scene: { type: "string" },
  action: { type: "string" }, dialogue: { type: "string" }, sound: { type: "string" },
  image_prompt: { type: "string" }, video_prompt: { type: "string" },
  character_names: { type: "array", items: { type: "string" }, maxItems: 6 },
  speaker_name: { type: "string" },
};

function normalizeName(value: string) {
  return value.trim().toLocaleLowerCase("zh-CN").replace(/[\s·・._-]+/g, "");
}

function matchCharacterIds(names: string[], characters: Character[]) {
  const requested = new Set(names.map(normalizeName).filter(Boolean));
  return characters.filter((character) => requested.has(normalizeName(character.name))).map((character) => character.id).slice(0, 6);
}

function cleanCharacterNames(names: string[]) {
  return [...new Set(names.map((name) => String(name).trim()).filter(Boolean))].slice(0, 6);
}

function matchCharacterId(name: string, characters: Character[]) {
  const requested = normalizeName(name);
  return characters.find((character) => normalizeName(character.name) === requested)?.id ?? null;
}

function storyboardSchema(shotCount: number) {
  return {
    type: "object", additionalProperties: false, required: ["title", "shots"],
    properties: {
      title: { type: "string" },
      shots: {
        type: "array", minItems: shotCount, maxItems: shotCount,
        items: { type: "object", additionalProperties: false, required: Object.keys(shotProperties), properties: shotProperties },
      },
    },
  };
}

function parseJson(text: string) {
  const cleaned = text.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  const start = cleaned.indexOf("{"); const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("AI 未返回有效分镜结构，请重试");
  return JSON.parse(cleaned.slice(start, end + 1)) as { title?: string; shots?: Shot[] };
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const supabase = await createServerSupabaseClient();
  let eventId = "";
  try {
    const body = (await request.json()) as { title?: string; story?: string; shotCount?: number; continueFromProjectId?: string };
    let story = body.story?.trim() ?? ""; let parentProjectId: string | null = null; const shotCount = Math.min(30, Math.max(6, Number(body.shotCount ?? 12)));
    if (body.continueFromProjectId) {
      const { data: previous } = await supabase.from("storyboard_projects").select("id,title,source_text,storyboard_shots(shot_number,scene,action,dialogue)").eq("id", body.continueFromProjectId).eq("user_id", user.id).maybeSingle();
      if (!previous) return NextResponse.json({ error: "没有找到要续写的上一集" }, { status: 404 });
      const ending = (previous.storyboard_shots ?? []).toSorted((a, b) => a.shot_number - b.shot_number).slice(-4).map((shot) => `镜头${shot.shot_number}：${shot.scene}；${shot.action}${shot.dialogue ? `；对白：${shot.dialogue}` : ""}`).join("\n");
      story = `请续写《${previous.title}》的下一集。保持原世界观、人物关系、身份、服装与时间线连续，承接上一集结尾，推进一个新的冲突，并在结尾留下更强悬念。\n\n上一集原始剧情：\n${String(previous.source_text ?? "").slice(-6000)}\n\n上一集结尾分镜：\n${ending}`;
      parentProjectId = previous.id;
    }
    if (!story || story.length < 30) return NextResponse.json({ error: "请粘贴至少30字的小说或剧情" }, { status: 400 });
    const apiKey = process.env.XAI_API_KEY; if (!apiKey) throw new Error("AI 服务尚未配置");
    const { data: characterRows } = await supabase.from("characters").select("id,name,version").eq("user_id", user.id).order("updated_at", { ascending: false }).limit(30);
    const characters = (characterRows ?? []) as Character[];
    const characterCatalog = characters.length
      ? characters.map((character) => `${character.name} V${character.version}`).join("、")
      : "暂无已创建角色";
    const usage = await reserveUsage(user.id, "chat"); eventId = usage.eventId;
    const response = await fetch("https://api.x.ai/v1/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, cache: "no-store", body: JSON.stringify({ model: "grok-4.5", temperature: 0.35, max_tokens: 12000, response_format: { type: "json_schema", json_schema: { name: "storyboard", strict: true, schema: storyboardSchema(shotCount) } }, messages: [{ role: "system", content: `你是专业竖屏漫剧导演。把用户故事拆成${shotCount}个连续、可直接制作的镜头。保持角色、服装、场景与时间连续；开头3秒有钩子，结尾有悬念。image_prompt 必须包含9:16画幅、角色、景别、构图和光线，并禁止文字水印；video_prompt 必须写清动作与运镜。当前用户角色库：${characterCatalog}。每个镜头的 character_names 填写画面中确实出现的剧情角色姓名，不要填写版本号、群演或泛称。已有角色必须使用角色库中的准确名称；剧情需要但角色库没有的人物也要保留原姓名，供用户补建角色。没有具名角色时返回空数组。speaker_name 填写 dialogue 的说话角色准确姓名；旁白、无人说话或无法确定时填空字符串。` }, { role: "user", content: story }] }) });
    const result = await response.json(); if (!response.ok) throw new Error(result?.error?.message ?? "分镜生成失败");
    const parsed = parseJson(result?.choices?.[0]?.message?.content ?? "");
    const shots = (parsed.shots ?? []).slice(0, shotCount).map((shot, index) => {
      const characterNames = cleanCharacterNames(Array.isArray(shot.character_names) ? shot.character_names : []);
      return {
      shot_number: index + 1,
      duration_seconds: Math.min(15, Math.max(2, Number(shot.duration_seconds ?? 5))),
      shot_type: String(shot.shot_type ?? ""), camera: String(shot.camera ?? ""), scene: String(shot.scene ?? ""),
      action: String(shot.action ?? ""), dialogue: String(shot.dialogue ?? ""), sound: String(shot.sound ?? ""),
      image_prompt: String(shot.image_prompt ?? ""), video_prompt: String(shot.video_prompt ?? ""),
      character_names: characterNames,
      character_ids: matchCharacterIds(characterNames, characters),
      speaker_character_id: matchCharacterId(String(shot.speaker_name ?? ""), characters),
    }; });
    if (!shots.length) throw new Error("没有生成分镜，请重试");
    const { data: project, error: projectError } = await supabase.from("storyboard_projects").insert({ user_id: user.id, title: parsed.title || body.title?.trim() || "未命名漫剧", source_text: story, parent_project_id: parentProjectId }).select("id,title,created_at,parent_project_id").single();
    if (projectError) throw projectError;
    const { data: savedShots, error: shotError } = await supabase.from("storyboard_shots").insert(shots.map((shot) => ({ ...shot, project_id: project.id, user_id: user.id }))).select("*").order("shot_number");
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
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.from("storyboard_projects").select("id,title,created_at,storyboard_shots(*)").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10);
  return NextResponse.json({ projects: data ?? [] });
}
