import { NextResponse } from "next/server";
import { getCurrentUser } from "@/app/lib/auth";
import { createServerSupabaseClient } from "@/app/lib/supabaseServer";
import { finishUsage, reserveUsage } from "@/app/lib/usage";

type Shot = { shot_number: number; duration_seconds: number; shot_type: string; camera: string; scene: string; action: string; dialogue: string; emotion: string; sound: string; image_prompt: string; video_prompt: string; character_names: string[]; speaker_name: string };
type Character = { id: string; name: string; version: number; voice_id?: string; voice_language?: string };

const shotProperties = {
  shot_number: { type: "integer" },
  duration_seconds: { type: "integer", minimum: 2, maximum: 15 },
  shot_type: { type: "string" }, camera: { type: "string" }, scene: { type: "string" },
  action: { type: "string" }, dialogue: { type: "string" },
  emotion: { type: "string", description: "Actor direction: emotion, intensity 1-5, pace, volume and subtext" },
  sound: { type: "string" },
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

function matchCharacter(name: string, characters: Character[]) {
  const requested = normalizeName(name);
  return characters.find((character) => normalizeName(character.name) === requested);
}

function stableVoiceForSpeaker(name: string) {
  const normalized = normalizeName(name);
  if (!normalized) return "orion";
  let hash = 0;
  for (const char of normalized) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const female = /苏雨晴|雨晴|女孩|少女|女人|女性|女主|小美|雪|月|瑶|娜|婷|兰|梅|芳/.test(name);
  const choices = female ? ["eve", "carina", "luna", "iris"] : ["rex", "orion", "perseus", "zagan"];
  return choices[hash % choices.length];
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
    let story = body.story?.trim() ?? ""; let parentProjectId: string | null = null; const shotCount = Math.min(30, Math.max(3, Number(body.shotCount ?? 12)));
    if (body.continueFromProjectId) {
      const { data: previous } = await supabase.from("storyboard_projects").select("id,title,source_text,storyboard_shots(shot_number,scene,action,dialogue)").eq("id", body.continueFromProjectId).eq("user_id", user.id).maybeSingle();
      if (!previous) return NextResponse.json({ error: "没有找到要续写的上一集" }, { status: 404 });
      const ending = (previous.storyboard_shots ?? []).toSorted((a, b) => a.shot_number - b.shot_number).slice(-4).map((shot) => `镜头${shot.shot_number}：${shot.scene}；${shot.action}${shot.dialogue ? `；对白：${shot.dialogue}` : ""}`).join("\n");
      story = `请续写《${previous.title}》的下一集。保持原世界观、人物关系、身份、服装与时间线连续，承接上一集结尾，推进一个新的冲突，并在结尾留下更强悬念。\n\n上一集原始剧情：\n${String(previous.source_text ?? "").slice(-6000)}\n\n上一集结尾分镜：\n${ending}`;
      parentProjectId = previous.id;
    }
    if (!story || story.length < 30) return NextResponse.json({ error: "请粘贴至少30字的小说或剧情" }, { status: 400 });
    const apiKey = process.env.XAI_API_KEY; if (!apiKey) throw new Error("AI 服务尚未配置");
    const { data: characterRows } = await supabase.from("characters").select("id,name,version,voice_id,voice_language").eq("user_id", user.id).order("updated_at", { ascending: false }).limit(30);
    const characters = (characterRows ?? []) as Character[];
    const characterCatalog = characters.length
      ? characters.map((character) => `${character.name} V${character.version}`).join("、")
      : "暂无已创建角色";
    const usage = await reserveUsage(user.id, "chat"); eventId = usage.eventId;
    story = `制作质量硬性要求：先明确主角当前目标，再让危险阻碍目标，角色必须作出选择，下一镜展示该选择的直接后果；禁止用巧合推进，禁止无铺垫加入新人物、能力或线索。每镜只完成一个主要动作，动作必须能在该镜时长内演完。对白必须口语化、带潜台词和明确情绪，不能解释画面已经展示的信息；每秒约4个汉字，台词长度必须匹配镜头时长，并给动作和呼吸留时间。视频提示词要求自然连续动作、稳定人体、克制运镜，禁止瞬移、变脸、换装、额外肢体和无原因跳切。\n\n原始剧情：\n${story}`;
    const response = await fetch("https://api.x.ai/v1/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, cache: "no-store", body: JSON.stringify({ model: "grok-4.5", temperature: 0.35, max_tokens: 12000, response_format: { type: "json_schema", json_schema: { name: "storyboard", strict: true, schema: storyboardSchema(shotCount) } }, messages: [{ role: "system", content: `你是专业竖屏漫剧导演。把用户故事拆成${shotCount}个连续、可直接制作的镜头。每个镜头必须承接上一镜的动作结果，禁止无解释地跳时间、换地点或增加新事件；保持角色、服装、场景与时间连续。${shotCount <= 3 ? "这是质量样片：第1镜必须交代人物目标和危险起因，第2镜让人物作出明确选择并升级冲突，第3镜展示选择造成的直接后果并留下悬念；三镜都必须有自然、推动剧情的对白或旁白，不能只写动作。" : "开头3秒有钩子，中段因果清楚，结尾有悬念。"} emotion 必须写成可执行的演员指令，包含主情绪、强度1-5、语速、音量和一句潜台词；相邻镜头的情绪变化必须有剧情原因。image_prompt 必须包含9:16画幅、角色、景别、构图和光线，并禁止文字水印；video_prompt 必须写清动作与运镜。sound 必须写明环境声、动作音效和情绪氛围。当前用户角色库：${characterCatalog}。每个镜头的 character_names 填写画面中确实出现的剧情角色姓名，不要填写版本号、群演或泛称。已有角色必须使用角色库中的准确名称；剧情需要但角色库没有的人物也要保留原姓名，供用户补建角色。没有具名角色时返回空数组。每个镜头的 dialogue 只能由一个角色说话，严禁在同一 dialogue 中写两人对话或用“角色名：”串联台词；需要换人说话时必须放到下一镜。speaker_name 必须填写该唯一说话角色的准确姓名；旁白、无人说话或无法确定时填空字符串。` }, { role: "user", content: story }] }) });
    const result = await response.json(); if (!response.ok) throw new Error(result?.error?.message ?? "分镜生成失败");
    let parsed = parseJson(result?.choices?.[0]?.message?.content ?? "");
    try {
      const reviewResponse = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          model: "grok-4.5",
          temperature: 0.2,
          max_tokens: 12000,
          response_format: { type: "json_schema", json_schema: { name: "reviewed_storyboard", strict: true, schema: storyboardSchema(shotCount) } },
          messages: [
            { role: "system", content: `你是漫剧总编剧和连续性审校。审核并重写这份${shotCount}镜分镜，但必须保留原故事核心事实、角色姓名和最终悬念。逐镜检查：上一镜的动作必须在下一镜产生直接后果；人物必须先有动机再做选择；换地点、时间或人物必须在画面中明确交代；道具、伤势、服装、光线和人物位置保持连续；每镜只允许一个主要动作；对白必须像真人说话、带情绪和潜台词，并且 speaker_name 与唯一说话人一致；emotion 必须包含情绪、强度1-5、语速、音量和潜台词，而且情绪转折必须由画面事件触发。删除重复信息、无铺垫巧合、突然出现的能力或线索。输出修正后的完整分镜，不要写审校说明。` },
            { role: "user", content: `原始创作要求：\n${story}\n\n待审校分镜：\n${JSON.stringify(parsed)}` },
          ],
        }),
      });
      const reviewedResult = await reviewResponse.json();
      if (reviewResponse.ok) {
        const reviewed = parseJson(reviewedResult?.choices?.[0]?.message?.content ?? "");
        if (reviewed.shots?.length === shotCount) parsed = reviewed;
      }
    } catch {
      // Keep the first valid draft if the optional continuity review is unavailable.
    }
    const shots = (parsed.shots ?? []).slice(0, shotCount).map((shot, index) => {
      const characterNames = cleanCharacterNames(Array.isArray(shot.character_names) ? shot.character_names : []);
      const dialogue = String(shot.dialogue ?? "");
      const speakerName = String(shot.speaker_name ?? "");
      const speaker = matchCharacter(speakerName, characters);
      const spokenUnits = [...dialogue.replace(/[\s，。！？、…,.!?]/g, "")].length;
      const dialogueMatchedDuration = spokenUnits ? Math.ceil(spokenUnits / 4.2 + 1) : Number(shot.duration_seconds ?? 5);
      return {
      shot_number: index + 1,
      duration_seconds: Math.min(15, Math.max(2, dialogueMatchedDuration)),
      shot_type: String(shot.shot_type ?? ""), camera: String(shot.camera ?? ""), scene: String(shot.scene ?? ""),
      action: String(shot.action ?? ""), dialogue,
      sound: `表演：${String(shot.emotion ?? "自然，强度2，正常语速")}；声音：${String(shot.sound ?? "")}`,
      image_prompt: String(shot.image_prompt ?? ""), video_prompt: String(shot.video_prompt ?? ""),
      character_names: characterNames,
      character_ids: matchCharacterIds(characterNames, characters),
      speaker_character_id: speaker?.id ?? matchCharacterId(speakerName, characters),
      voice_id: speaker?.voice_id || stableVoiceForSpeaker(speakerName),
      voice_language: speaker?.voice_language || "zh",
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
