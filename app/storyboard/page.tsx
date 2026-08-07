"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/app/lib/supabase";
import { characterVoiceOptions, normalizeVoiceId } from "@/app/lib/voiceCatalog";
import { normalizeDramaticFunction } from "@/app/lib/dramaticProgression";
import { continuityReferenceImage } from "@/app/lib/storyboardReferences";
import { storyTemplates, type StoryTemplate } from "@/app/lib/storyTemplates";

type Shot = { id: string; shot_number: number; duration_seconds: number; shot_type: string; camera: string; scene: string; action: string; dialogue: string; sound: string; image_prompt: string; video_prompt: string; image_url?: string; video_url?: string; audio_url?: string; voice_id?: string; voice_language?: string; subtitle_start_ms?: number; subtitle_end_ms?: number; media_status?: string; error_message?: string; character_ids?: string[] | null; character_names?: string[] | null; speaker_character_id?: string | null };
type Project = { id: string; title: string; created_at: string; character_id?: string; parent_project_id?: string | null; storyboard_shots: Shot[] };
type Character = { id: string; name: string; version: number; voice_id?: string; voice_language?: string; images?: { front?: string; left?: string; right?: string; full?: string } };

export default function StoryboardPage() {
  const router = useRouter();
  const [story, setStory] = useState(""); const [title, setTitle] = useState(""); const [shotCount, setShotCount] = useState("12");
  const [shots, setShots] = useState<Shot[]>([]); const [projects, setProjects] = useState<Project[]>([]); const [characters, setCharacters] = useState<Character[]>([]);
  const [currentTitle, setCurrentTitle] = useState(""); const [currentProjectId, setCurrentProjectId] = useState(""); const [characterId, setCharacterId] = useState(""); const [voiceId, setVoiceId] = useState("rex"); const [voiceLanguage, setVoiceLanguage] = useState("zh"); const [videoResolution,setVideoResolution]=useState<"480p"|"720p">("720p"); const [loading, setLoading] = useState(false); const [batching, setBatching] = useState(false); const [status, setStatus] = useState("");
  const autoResumeRef = useRef(new Set<string>());

  useEffect(() => { supabase.auth.getUser().then(async ({ data }) => {
    if (!data.user) { router.replace("/login"); return; }
    const requestedId = new URLSearchParams(window.location.search).get("project");
    const [response, characterResult, requestedResponse] = await Promise.all([
      fetch("/api/storyboard", { cache: "no-store" }),
      supabase.from("characters").select("id,name,version,voice_id,voice_language,images").order("updated_at", { ascending: false }),
      requestedId ? fetch(`/api/storyboard/projects/${requestedId}`, { cache: "no-store" }) : Promise.resolve(null),
    ]);
    const loadedProjects = response.ok ? (await response.json()).projects as Project[] : [];
    const requestedProject = requestedResponse?.ok ? (await requestedResponse.json()).project as Project : undefined;
    const allProjects = requestedProject && !loadedProjects.some((project) => project.id === requestedProject.id) ? [requestedProject, ...loadedProjects] : loadedProjects;
    setProjects(allProjects);
    const selected = requestedProject ?? allProjects[0];
    if (selected) { setShots(selected.storyboard_shots.toSorted((a,b) => a.shot_number-b.shot_number)); setCurrentTitle(selected.title); setCurrentProjectId(selected.id); setCharacterId(selected.character_id || ""); }
    setCharacters(((characterResult.data ?? []) as Character[]).map((character) => ({ ...character, voice_id: normalizeVoiceId(character.voice_id) })));
  }); }, [router]);

  useEffect(() => {
    if (batching) return;
    const interrupted = shots.filter((shot) => shot.media_status === "lipsync_generating" && !autoResumeRef.current.has(shot.id));
    if (!interrupted.length) return;
    interrupted.forEach((shot) => autoResumeRef.current.add(shot.id));
    void (async () => {
      setBatching(true);
      try {
        for (let index = 0; index < interrupted.length; index++) {
          const shot = interrupted[index]; setStatus(`正在自动恢复口型任务 ${index + 1}/${interrupted.length} · 镜头 ${shot.shot_number}`);
          try { await lipSyncOne(shot); }
          catch (error) { await updateShot(shot.id, { status: "failed", error: error instanceof Error ? error.message : "恢复口型任务失败" }); }
        }
        setStatus("中断的口型任务已恢复完成");
      } finally { setBatching(false); }
    })();
  // lipSyncOne is intentionally omitted: the ref makes each persisted job resume once.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shots, batching]);

  async function generate(event: FormEvent) {
    event.preventDefault(); setLoading(true); setStatus("AI 导演正在拆分镜头…"); setShots([]);
    try { const response = await fetch("/api/storyboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, story, shotCount: Number(shotCount) }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error); setShots(data.shots); setCurrentTitle(data.project.title); setCurrentProjectId(data.project.id); setProjects((current) => [{ ...data.project, storyboard_shots: data.shots }, ...current]); const bound = data.shots.filter((shot: Shot) => shot.character_ids?.length).length; const knownNames = new Set(characters.map((character) => character.name.trim().toLocaleLowerCase("zh-CN"))); const missing = new Set<string>(data.shots.flatMap((shot: Shot) => (shot.character_names ?? []).filter((name) => !knownNames.has(name.trim().toLocaleLowerCase("zh-CN"))))); setStatus(`已生成 ${data.shots.length} 个镜头，自动绑定 ${bound} 镜${missing.size ? `，发现 ${missing.size} 个待创建角色` : ""}，剩余 ${data.credits} 积分`); }
    catch (error) { setStatus(error instanceof Error ? error.message : "拆分镜失败"); } finally { setLoading(false); }
  }

  async function updateShot(id: string, body: Record<string, string | string[] | null>) { const response = await fetch(`/api/storyboard/shots/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "保存镜头失败"); setShots((current) => current.map((shot) => shot.id === id ? { ...shot, ...data.shot } : shot)); return data.shot as Shot; }

  function applyStoryTemplate(template: StoryTemplate) {
    setTitle(template.title); setStory(template.story); setShotCount(template.shotCount);
    setStatus(`已载入「${template.label}」剧情模板，可直接修改角色和情节后生成分镜`);
  }

  const effectiveCharacterIds = (shot: Shot) => Array.isArray(shot.character_ids) ? shot.character_ids : characterId ? [characterId] : [];
  const missingCharacterNames = (shot: Shot) => (shot.character_names ?? []).filter((name) => !characters.some((character) => character.name.trim().toLocaleLowerCase("zh-CN") === name.trim().toLocaleLowerCase("zh-CN")));
  const sceneKey = (value: string) => value.toLocaleLowerCase("zh-CN").split(/[，。；：,;:|｜]/)[0].replace(/[\s\-_]/g, "").slice(0, 24);
  const sameScene = (left: string, right: string) => { const a=sceneKey(left);const b=sceneKey(right);return Boolean(a&&b&&(a===b||a.includes(b)||b.includes(a))); };
  const imageReferenceContext = (shot: Shot, previous?: Shot, styleImage?: string) => {
    const currentIds = effectiveCharacterIds(shot); if (!previous) return { characterIds: currentIds, referenceImage: undefined, referenceMode: "identity" as const, styleImage };
    const previousCharacterIds=effectiveCharacterIds(previous);const previousIds = new Set(previousCharacterIds); const entering = currentIds.filter((id) => !previousIds.has(id)); const continuing = currentIds.filter((id) => previousIds.has(id));
    const sceneContinues = sameScene(previous.scene, shot.scene);
    const referenceImage = continuityReferenceImage(currentIds,previousCharacterIds,sceneContinues,previous.image_url);
    return { characterIds: [...entering, ...continuing], referenceImage, referenceMode: sceneContinues ? "scene" as const : "identity" as const, styleImage: styleImage === referenceImage ? undefined : styleImage };
  };

  async function toggleShotCharacter(shot: Shot, id: string, checked: boolean) {
    const current = effectiveCharacterIds(shot); const next = checked ? [...new Set([...current, id])] : current.filter((item) => item !== id);
    await updateShot(shot.id, { characterIds: next });
    setStatus(`镜头 ${shot.shot_number} 已绑定 ${next.length} 个角色`);
  }

  async function applyShotTemplate(shot: Shot, template: "closeup" | "near" | "medium" | "wide", label: string) {
    try { await updateShot(shot.id, { shotTemplate: template }); setStatus(`镜头 ${shot.shot_number} 已应用${label}模板，提示词和运镜已自动更新`); }
    catch (error) { setStatus(error instanceof Error ? error.message : "应用镜头模板失败"); }
  }

  async function continueProject() {
    if (!currentProjectId || loading) return;
    if (!window.confirm("AI 将读取本集剧情和结尾，生成下一集完整分镜，预计消耗 1 积分。确定继续吗？")) return;
    setLoading(true); setStatus("AI 编剧正在承接本集结尾，创作下一集…");
    try {
      const response = await fetch("/api/storyboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ continueFromProjectId: currentProjectId, shotCount: Number(shotCount) }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      setShots(data.shots); setCurrentTitle(data.project.title); setCurrentProjectId(data.project.id); setCharacterId(data.project.character_id || ""); setProjects((current) => [{ ...data.project, storyboard_shots: data.shots }, ...current]);
      setStatus(`下一集已生成 ${data.shots.length} 个镜头，剩余 ${data.credits} 积分`);
      window.history.replaceState(null, "", `/storyboard?project=${data.project.id}`);
    } catch (error) { setStatus(error instanceof Error ? error.message : "续写下一集失败"); }
    finally { setLoading(false); }
  }

  async function bindCharacter(nextCharacterId: string) {
    if (!currentProjectId) return;
    setCharacterId(nextCharacterId); setStatus("正在保存整集角色绑定…");
    const response = await fetch(`/api/storyboard/projects/${currentProjectId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ characterId: nextCharacterId || null }) });
    const data = await response.json();
    if (!response.ok) return setStatus(data.error || "保存角色绑定失败");
    setProjects((current) => current.map((project) => project.id === currentProjectId ? { ...project, character_id: nextCharacterId || undefined } : project));
    const selectedCharacter = characters.find((character) => character.id === nextCharacterId);
    setStatus(selectedCharacter ? `已将 ${selectedCharacter.name} V${selectedCharacter.version} 应用到整集分镜` : "已取消整集角色绑定");
  }

  async function batchImages() {
    const pending = shots.filter((shot) => !shot.image_url); if (!pending.length) return setStatus("所有镜头都已有图片");
    const quality = qualityReport(pending, { includePerformance: false }); if (quality.critical.length) return setStatus(`批量图片已暂停：${quality.critical.slice(0,3).join("；")}`);
    if (!window.confirm(`将生成 ${pending.length} 张图片，预计消耗 ${pending.length * 20} 积分。确定继续吗？`)) return;
    setBatching(true);
    const workingImages=shots.map((shot)=>({...shot}));
    let styleImage = shots.filter((shot) => shot.image_url).toSorted((a,b) => a.shot_number-b.shot_number)[0]?.image_url;
    for (let index = 0; index < pending.length; index++) { const shot = pending[index];const shotIndex=workingImages.findIndex((item)=>item.id===shot.id);const previousShot=workingImages.slice(0,Math.max(0,shotIndex)).toReversed().find((item)=>item.image_url); setStatus(`正在生成图片 ${index + 1}/${pending.length} · 镜头 ${shot.shot_number}`); try { await updateShot(shot.id, { status: "image_generating", error: "" }); const context=imageReferenceContext(shot,previousShot,styleImage); const response = await fetch("/api/image", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: shot.image_prompt, aspectRatio: "9:16", ...context, batch: true }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error); const updated=await updateShot(shot.id, { imageUrl: data.imageUrl, status: "image_ready", error: "" });if(shotIndex>=0)workingImages[shotIndex]=updated;styleImage ||= data.imageUrl; } catch (error) { await updateShot(shot.id, { status: "failed", error: error instanceof Error ? error.message : "图片生成失败" }); } }
    setBatching(false); setStatus("批量图片生成完成");
  }

  async function batchVideos() {
    const pending = shots.filter((shot) => shot.image_url && !shot.video_url); if (!pending.length) return setStatus("没有等待转视频的分镜图片");
    const quality = qualityReport(pending); if (quality.critical.length) return setStatus(`批量视频已暂停：${quality.critical.slice(0,3).join("；")}`);
    const videoCreditCost=videoResolution==="720p"?112:80;const estimatedXai=pending.reduce((sum,shot)=>sum+Math.min(15,shot.duration_seconds)*(videoResolution==="720p"?.07:.05),0);
    if (!window.confirm(`将以 ${videoResolution} 生成 ${pending.length} 段视频，预计消耗 ${pending.length * videoCreditCost} 积分，xAI API 约 $${estimatedXai.toFixed(2)} 美元。过程可能需要较长时间，确定继续吗？`)) return;
    setBatching(true);
    for (let index = 0; index < pending.length; index++) { const shot = pending[index]; setStatus(`正在生成视频 ${index + 1}/${pending.length} · 镜头 ${shot.shot_number}`); try { await updateShot(shot.id, { status: "video_generating", error: "" }); const response = await fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: "xai", prompt: shot.video_prompt, image: shot.image_url, duration: Math.min(15, shot.duration_seconds), aspectRatio: "9:16", resolution: videoResolution, characterIds: effectiveCharacterIds(shot), batch: true }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error); let videoUrl = ""; for (let attempt = 0; attempt < 120; attempt++) { await new Promise((resolve) => setTimeout(resolve, 5000)); const check = await fetch(`/api/status?requestId=${encodeURIComponent(data.requestId)}`, { cache: "no-store" }); const detail = await check.json(); if (!check.ok) throw new Error(detail.error); if (detail.status === "done") { videoUrl = detail.videoUrl; break; } if (["failed", "expired"].includes(detail.status)) throw new Error("视频生成失败，积分已退还"); } if (!videoUrl) throw new Error("视频仍在处理中，请稍后重试"); await updateShot(shot.id, { videoUrl, status: "completed", error: "" }); } catch (error) { await updateShot(shot.id, { status: "failed", error: error instanceof Error ? error.message : "视频生成失败" }); } }
    setBatching(false); setStatus("批量视频生成完成");
  }

  async function batchVoices() {
    const pending = shots.filter((shot) => shot.dialogue?.trim() && !shot.audio_url);
    if (!pending.length) return setStatus("所有有对白的镜头都已有配音");
    const quality = qualityReport(pending, { includeVisual: false, includeCharacters: false }); if (quality.critical.length) return setStatus(`批量配音已暂停：${quality.critical.slice(0,3).join("；")}`);
    if (!window.confirm(`将生成 ${pending.length} 段配音，预计消耗 ${pending.length * 2} 积分。确定继续吗？`)) return;
    setBatching(true);
    for (let index = 0; index < pending.length; index++) {
      const shot = pending[index]; setStatus(`正在生成配音 ${index + 1}/${pending.length} · 镜头 ${shot.shot_number}`);
      try {
        const speaker = characters.find((character) => character.id === shot.speaker_character_id);
        const response = await fetch(`/api/storyboard/shots/${shot.id}/voice`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ voiceId: speaker?.voice_id || shot.voice_id, fallbackVoiceId: voiceId, language: speaker?.voice_language || shot.voice_language || voiceLanguage, batch: true }) });
        const data = await response.json(); if (!response.ok) throw new Error(data.error);
        setShots((current) => current.map((item) => item.id === shot.id ? data.shot : item));
      } catch (error) { setStatus(error instanceof Error ? error.message : "配音生成失败"); }
    }
    setBatching(false); setStatus("批量配音与字幕时间轴生成完成");
  }

  async function regenerateVoice(shot: Shot) {
    if (batching || !shot.dialogue?.trim()) return;
    const quality = qualityReport([shot], { includeVisual: false, includeCharacters: false }); if (quality.critical.length) return setStatus(`重新配音已暂停：${quality.critical.join("；")}`);
    if (!window.confirm(`将重新生成镜头 ${shot.shot_number} 的配音，预计消耗 2 积分。确定继续吗？`)) return;
    setBatching(true); setStatus(`正在重新配音 · 镜头 ${shot.shot_number}`);
    try {
      const speaker = characters.find((character) => character.id === shot.speaker_character_id);
      const response = await fetch(`/api/storyboard/shots/${shot.id}/voice`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ voiceId: speaker?.voice_id || shot.voice_id, fallbackVoiceId: voiceId, language: speaker?.voice_language || shot.voice_language || voiceLanguage }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      setShots((current) => current.map((item) => item.id === shot.id ? data.shot : item));
      setStatus(`镜头 ${shot.shot_number} 已使用 ${data.shot.voice_id} 重新配音，可直接试听`);
    } catch (error) { setStatus(error instanceof Error ? error.message : "重新配音失败"); }
    finally { setBatching(false); }
  }

  const lipSyncMode = (shot: Shot) => {
    const distant = /远景|全景|空镜/.test(shot.shot_type || "");
    const intense = /强度\s*[:：]?\s*[4-5]|大喊|哭|愤怒|惊恐/.test(`${shot.sound || ""} ${shot.action || ""}`);
    return !distant || intense ? "precision" : "speed";
  };
  const isLipSynced = (shot: Shot) => shot.media_status === "lipsync_ready" || /heygen/i.test(shot.video_url || "");
  const requiresLipSync = (shot: Shot) => Boolean(shot.dialogue?.trim() && shot.speaker_character_id);
  const needsProductionRetry = (shot: Shot) => shot.media_status === "failed" || shot.media_status === "lipsync_generating" || Boolean(shot.error_message) || !shot.image_url || !shot.video_url || Boolean(shot.dialogue?.trim()&&!shot.audio_url) || (requiresLipSync(shot)&&!isLipSynced(shot));
  function qualityReport(items: Shot[], options: { includePerformance?: boolean; includeVisual?: boolean; includeCharacters?: boolean } = {}) {
    const includePerformance = options.includePerformance ?? true;
    const includeVisual = options.includeVisual ?? true;
    const includeCharacters = options.includeCharacters ?? true;
    const critical: string[] = []; const warnings: string[] = []; const seenDramaticFunctions = new Map<string,number>();
    for (const shot of items) {
      const label = `镜头 ${shot.shot_number}`;
      if (includeVisual && (!shot.image_prompt?.trim() || !shot.video_prompt?.trim())) critical.push(`${label} 缺少图片或视频提示词`);
      if (includeVisual && shot.image_prompt?.trim() && shot.video_prompt?.trim()) {
        const contractComplete = [shot.image_prompt, shot.video_prompt].every((prompt) => {
          const dramaticFunction = prompt.match(/\[DRAMATIC FUNCTION\]\s*\n?([^\n]+)/i)?.[1]?.trim() ?? "";
          const causalLink = prompt.match(/\[CAUSAL LINK\]\s*\n?([^\n]+)/i)?.[1]?.trim() ?? "";
          const continuityState = prompt.match(/\[CONTINUITY STATE\]\s*\n?([^\n]+)/i)?.[1]?.trim() ?? "";
          return dramaticFunction.length >= 15 && causalLink.length >= 10 && continuityState.length >= 20;
        });
        if (!contractComplete) critical.push(`${label} 缺少剧情推进、因果链或镜头结束状态，需先执行 AI 修复对白与连续性`);
        const dramaticFunction=shot.video_prompt.match(/\[DRAMATIC FUNCTION\]\s*\n?([^\n]+)/i)?.[1]?.trim()??"";const normalizedFunction=normalizeDramaticFunction(dramaticFunction);
        if(normalizedFunction){const duplicate=seenDramaticFunctions.get(normalizedFunction);if(duplicate)critical.push(`${label} 与镜头 ${duplicate} 的剧情功能完全重复，需先执行 AI 修复`);else seenDramaticFunctions.set(normalizedFunction,shot.shot_number);}
        if (shot.dialogue?.trim() && shot.speaker_character_id && !/\[口型同步准备\]/.test(shot.video_prompt)) critical.push(`${label} 缺少说话人脸部与闭嘴约束，需先执行 AI 修复对白与连续性`);
      }
      if (!Number.isFinite(shot.duration_seconds) || shot.duration_seconds < 2 || shot.duration_seconds > 15) critical.push(`${label} 时长不在 2-15 秒范围`);
      const spoken = Array.from((shot.dialogue || "").replace(/[\s，。！？、…,.!?]/g, "")).length;
      const mildDialogueLimit = shot.duration_seconds * 4.2;
      const severeDialogueLimit = shot.duration_seconds * 5.2;
      if (includePerformance && spoken > severeDialogueLimit) critical.push(`${label} 台词严重超长（${spoken} 字/${shot.duration_seconds} 秒），必须缩短或延长镜头后再配音`);
      else if (includePerformance && spoken > mildDialogueLimit) warnings.push(`${label} 台词偏长（${spoken} 字/${shot.duration_seconds} 秒），建议缩短以保留情绪和呼吸空间`);
      const speakerLabels = [...(shot.dialogue || "").matchAll(/(?:^|[\n。！？!?]\s*)([\p{L}\p{N}_·]{1,12})\s*[：:]/gu)].map((match) => match[1].trim());
      if (includePerformance && new Set(speakerLabels).size > 1) critical.push(`${label} 同时包含多个说话人（${[...new Set(speakerLabels)].join("、")}），必须拆成一人一镜再配音和同步口型`);
      if (shot.dialogue?.trim() && !shot.speaker_character_id) warnings.push(`${label} 有对白但没有绑定说话角色`);
      const performance = shot.sound || "";
      const hasPerformanceDirection = /(?:表演|情绪|语气|口吻)\s*[:：]\s*\S+/.test(performance)
        && /强度\s*[:：]?\s*[1-5]/.test(performance)
        && /(?:语速|速度|节奏|音量|轻声|低声|大喊|耳语)/.test(performance);
      if (includePerformance && shot.dialogue?.trim() && !hasPerformanceDirection) critical.push(`${label} 缺少可执行的情绪表演指令（情绪、强度、语速或音量）`);
      if (includeCharacters) {
        const boundIds = new Set(effectiveCharacterIds(shot)); const expectedNames = shot.character_names ?? [];
        const absentNames = expectedNames.filter((name) => !characters.some((character) => character.name.trim().toLocaleLowerCase("zh-CN") === name.trim().toLocaleLowerCase("zh-CN")));
        const unboundNames = expectedNames.filter((name) => { const character=characters.find((item)=>item.name.trim().toLocaleLowerCase("zh-CN")===name.trim().toLocaleLowerCase("zh-CN"));return character&&!boundIds.has(character.id); });
        if (absentNames.length) critical.push(`${label} 缺少角色库：${absentNames.join("、")}`);
        if (unboundNames.length) critical.push(`${label} 未绑定角色：${unboundNames.join("、")}`);
        for (const id of boundIds) {
          const character=characters.find((item)=>item.id===id); const referenceCount=character ? Object.values(character.images ?? {}).filter(Boolean).length : 0;
          if(!character?.images?.front)critical.push(`${label} 的 ${character?.name ?? "角色"} 缺少正面参考图`);
          else if(referenceCount<3)critical.push(`${label} 的 ${character.name} 只有 ${referenceCount}/4 个参考角度，至少补到 3 个再制作`);
          else if(referenceCount<4)warnings.push(`${label} 的 ${character.name} 已有 ${referenceCount}/4 个参考角度，补齐全身或侧面图会更稳定`);
        }
      }
    }
    return { critical, warnings, score: Math.max(0, 100 - critical.length * 25 - warnings.length * 6) };
  }

  function runQualityCheck() {
    const report = qualityReport(shots);
    if (report.critical.length) return setStatus(`制作检查 ${report.score} 分 · 必须修正：${report.critical.slice(0, 3).join("；")}`);
    if (report.warnings.length) return setStatus(`制作检查 ${report.score} 分 · 建议优化：${report.warnings.slice(0, 3).join("；")}`);
    setStatus("制作检查 100 分 · 剧情、角色、台词时长和情绪指令均可进入整集制作");
  }

  async function polishDialogue() {
    if (!currentProjectId || batching) return;
    const generated = shots.filter((shot) => shot.image_url || shot.audio_url || shot.video_url).length;
    if (generated && !window.confirm(`已有 ${generated} 个镜头生成过配音或视频。修复会改写剧情推进、连续性或对白；提示词发生变化的旧画面将作废，声音变化的旧配音和口型也会作废，避免新旧内容混用。确定继续吗？`)) return;
    setBatching(true); setStatus("AI 正在逐镜修复对白、情绪、台词时长和连续性提示词…");
    try { const response = await fetch(`/api/storyboard/projects/${currentProjectId}/polish`, { method: "POST" }); const data = await response.json(); if (!response.ok) throw new Error(data.error); setShots(data.shots); setStatus(`质量修复完成 · 已校准 ${data.shots.length} 个镜头 · 升级 ${data.upgradedPrompts ?? 0} 个剧情与连续性提示词 · 修正 ${data.upgradedVoices ?? 0} 个声线 · ${data.invalidatedVisuals ?? 0} 个旧画面需重新生成 · 剩余 ${data.credits} 积分`); }
    catch (error) { setStatus(error instanceof Error ? error.message : "对白修复失败"); }
    finally { setBatching(false); }
  }

  async function paddedWavBase64(url: string, targetSeconds: number) {
    const response = await fetch(url); if (!response.ok) throw new Error("读取配音失败");
    const context = new AudioContext();
    try {
      const source = await context.decodeAudioData(await response.arrayBuffer()); const channels = 1; const rate = 16000;
      const outputSeconds=Math.min(30,Math.max(targetSeconds,source.duration));const frames = Math.ceil(outputSeconds * rate); const bytes = new ArrayBuffer(44 + frames * channels * 2); const view = new DataView(bytes);
      const write = (offset: number, value: string) => { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)); };
      write(0,"RIFF"); view.setUint32(4,36 + frames * channels * 2,true); write(8,"WAVE"); write(12,"fmt "); view.setUint32(16,16,true); view.setUint16(20,1,true); view.setUint16(22,channels,true); view.setUint32(24,rate,true); view.setUint32(28,rate * channels * 2,true); view.setUint16(32,channels * 2,true); view.setUint16(34,16,true); write(36,"data"); view.setUint32(40,frames * channels * 2,true);
      let offset = 44; for (let frame = 0; frame < frames; frame++) { const sourceFrame = Math.floor(frame * source.sampleRate / rate); let sample = 0; if (sourceFrame < source.length) for (let channel = 0; channel < source.numberOfChannels; channel++) sample += source.getChannelData(channel)[sourceFrame] / source.numberOfChannels; sample = Math.max(-1,Math.min(1,sample)); view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true); offset += 2; }
      const data = new Uint8Array(bytes); let binary = ""; for (let i = 0; i < data.length; i += 0x8000) binary += String.fromCharCode(...data.subarray(i,i + 0x8000)); return {base64:btoa(binary),audioSeconds:source.duration};
    } finally { await context.close(); }
  }

  async function videoDurationSeconds(url: string) {
    return await new Promise<number>((resolve, reject) => {
      const video = document.createElement("video");
      const timeout = window.setTimeout(() => reject(new Error("读取视频时长超时")), 15000);
      const cleanup = () => { window.clearTimeout(timeout); video.removeAttribute("src"); video.load(); };
      video.preload = "metadata";
      video.onloadedmetadata = () => { const duration = video.duration; cleanup(); if(Number.isFinite(duration)&&duration>0)resolve(duration);else reject(new Error("视频时长无效")); };
      video.onerror = () => { cleanup(); reject(new Error("读取视频时长失败")); };
      video.src = url;
    });
  }

  async function lipSyncOne(shot: Shot) {
    const mode = lipSyncMode(shot);
    const resuming = shot.media_status === "lipsync_generating";
    let jobId = "";
    if (!resuming) {
    const targetSeconds = await videoDurationSeconds(shot.video_url!);
    const paddedAudio = await paddedWavBase64(`/api/storyboard/shots/${shot.id}/audio`, targetSeconds);
    const overrun=paddedAudio.audioSeconds-targetSeconds;const allowedOverrun=Math.max(.25,targetSeconds*.05);if(overrun>allowedOverrun)throw new Error(`镜头 ${shot.shot_number} 的配音 ${paddedAudio.audioSeconds.toFixed(1)} 秒，比视频 ${targetSeconds.toFixed(1)} 秒长 ${overrun.toFixed(1)} 秒。为避免口型错位，请按新配音时长重新生成这个视频后再同步口型`);
    const paddedAudioBase64 = paddedAudio.base64;
    const response = await fetch(`/api/storyboard/shots/${shot.id}/lipsync`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode, paddedAudioBase64 }) });
    const created = await response.json(); if (!response.ok) throw new Error(created.error || "口型同步创建失败");
      jobId = String(created.jobId || "");
    }
    for (let attempt = 0; attempt < 180; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      const query = jobId ? `?jobId=${encodeURIComponent(jobId)}` : "";
      const check = await fetch(`/api/storyboard/shots/${shot.id}/lipsync${query}`, { cache: "no-store" });
      const detail = await check.json(); if (!check.ok) throw new Error(detail.error || "查询口型同步任务失败");
      if (detail.status === "completed") { const completedShot=detail.shot as Shot;setShots((current) => current.map((item) => item.id === shot.id ? completedShot : item)); return completedShot; }
      if (detail.status === "failed") throw new Error(detail.error || "口型同步失败");
    }
    throw new Error("口型同步仍在处理中，请稍后再试");
  }

  async function batchLipSync(onlyShot?: Shot) {
    if (batching) return;
    const pending = (onlyShot ? [onlyShot] : shots).filter((shot) => shot.video_url && shot.audio_url && requiresLipSync(shot) && !isLipSynced(shot));
    if (!pending.length) return setStatus("没有等待口型同步的镜头，请先生成视频和配音");
    const estimate = pending.reduce((sum, shot) => sum + shot.duration_seconds * (lipSyncMode(shot) === "precision" ? 0.0667 : 0.0333), 0);
    if (!onlyShot && !window.confirm(`将同步 ${pending.length} 个镜头的声音和口型，预计消耗 HeyGen 约 $${estimate.toFixed(2)} 美元。特写/近景使用高精度，其余使用快速模式。确定继续吗？`)) return;
    setBatching(true); let failures = 0; let lastFailure = "";
    try {
      for (let index = 0; index < pending.length; index++) {
        const shot = pending[index]; setStatus(`HeyGen 口型同步 ${index + 1}/${pending.length} · 镜头 ${shot.shot_number}`);
        try { await lipSyncOne(shot); } catch (error) { failures++; lastFailure = error instanceof Error ? error.message : "口型同步失败"; setStatus(lastFailure); }
      }
      setStatus(failures ? `口型同步失败：${lastFailure || `${failures} 个镜头失败`}` : "声音与口型同步完成，可直接播放检查效果");
    } finally { setBatching(false); }
  }

  async function generateFullEpisode(retryShotIds?: Set<string>) {
    if (batching || !shots.length) return;
    const targetShots = retryShotIds ? shots.filter((shot) => retryShotIds.has(shot.id)) : shots;
    const quality = qualityReport(targetShots);
    if (quality.critical.length) return setStatus(`整集制作已暂停：${quality.critical.slice(0, 3).join("；")}`);
    const imageCount = targetShots.filter((shot) => !shot.image_url).length; const videoCount = targetShots.filter((shot) => !shot.video_url).length; const voiceCount = targetShots.filter((shot) => shot.dialogue?.trim() && !shot.audio_url).length; const lipSyncCount = targetShots.filter((shot) => requiresLipSync(shot) && !isLipSynced(shot)).length;
    const videoCreditCost=videoResolution==="720p"?112:80;const estimatedCredits = imageCount * 20 + videoCount * videoCreditCost + voiceCount * 2;
    const estimatedXaiVideo=targetShots.filter((shot)=>!shot.video_url).reduce((sum,shot)=>sum+Math.min(15,shot.duration_seconds)*(videoResolution==="720p"?.07:.05),0);
    const estimatedHeyGen = targetShots.filter((shot) => requiresLipSync(shot) && !isLipSynced(shot)).reduce((sum, shot) => sum + shot.duration_seconds * (lipSyncMode(shot) === "precision" ? 0.0667 : 0.0333), 0);
    if (!imageCount && !videoCount && !voiceCount && !lipSyncCount) return setStatus("所选任务已经全部完成");
    const actionName = retryShotIds ? "重试失败任务" : "一键生成整集";
    const qualityNote = quality.warnings.length ? `\n\n制作检查 ${quality.score} 分，发现 ${quality.warnings.length} 项建议：\n${quality.warnings.slice(0, 4).join("\n")}` : "\n\n制作检查 100 分，未发现明显问题。";
    if (!window.confirm(`${actionName}将只处理未完成内容：${imageCount} 张图片、${videoCount} 段 ${videoResolution} 视频、${voiceCount} 段配音与字幕、${lipSyncCount} 段口型同步；预计最多消耗 ${estimatedCredits} 积分、xAI 视频约 $${estimatedXaiVideo.toFixed(2)} 美元、HeyGen 约 $${estimatedHeyGen.toFixed(2)} 美元，已成功内容不会重复生成。${qualityNote}\n\n确定继续吗？`)) return;
    setBatching(true); const working = shots.map((shot) => ({ ...shot })); let failures = 0;let styleImage=working.find((shot)=>shot.image_url)?.image_url;
    try {
      for (let index = 0; index < working.length; index++) {
        let shot = working[index]; if ((retryShotIds && !retryShotIds.has(shot.id)) || shot.image_url) continue; setStatus(`整集制作 1/5 · 生成图片 ${index + 1}/${working.length} · 镜头 ${shot.shot_number}`);
        try { await updateShot(shot.id, { status: "image_generating", error: "" }); const prior=working.slice(0,index).toReversed().find((item)=>item.image_url);const context=imageReferenceContext(shot,prior,styleImage); const response = await fetch("/api/image", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: shot.image_prompt, aspectRatio: "9:16", ...context, batch: true }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error); shot = await updateShot(shot.id, { imageUrl: data.imageUrl, status: "image_ready", error: "" }); styleImage ||= data.imageUrl;working[index] = shot; }
        catch (error) { failures++; working[index] = await updateShot(shot.id, { status: "failed", error: error instanceof Error ? error.message : "图片生成失败" }); }
      }
      for (let index = 0; index < working.length; index++) {
        let shot = working[index]; if ((retryShotIds && !retryShotIds.has(shot.id)) || !shot.image_url || shot.video_url) continue;
        try {
          if (shot.dialogue?.trim() && !shot.audio_url) {
            setStatus(`整集制作 2/5 · 先生成配音并校准时长 ${index + 1}/${working.length} · 镜头 ${shot.shot_number}`);
            const speaker = characters.find((character) => character.id === shot.speaker_character_id);
            const voiceResponse = await fetch(`/api/storyboard/shots/${shot.id}/voice`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ voiceId: speaker?.voice_id || shot.voice_id, fallbackVoiceId: voiceId, language: speaker?.voice_language || shot.voice_language || voiceLanguage, batch: true }) });
            const voiceData = await voiceResponse.json(); if (!voiceResponse.ok) throw new Error(voiceData.error);
            shot = voiceData.shot as Shot; working[index] = shot; setShots((current) => current.map((item) => item.id === shot.id ? shot : item));
          }
          setStatus(`整集制作 3/5 · 按配音时长生成视频 ${index + 1}/${working.length} · 镜头 ${shot.shot_number}`);
          await updateShot(shot.id, { status: "video_generating", error: "" }); const response = await fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: "xai", prompt: shot.video_prompt, image: shot.image_url, duration: Math.min(15, shot.duration_seconds), aspectRatio: "9:16", resolution: videoResolution, characterIds: effectiveCharacterIds(shot), batch: true }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error); let videoUrl = ""; for (let attempt = 0; attempt < 120; attempt++) { await new Promise((resolve) => setTimeout(resolve, 5000)); const check = await fetch(`/api/status?requestId=${encodeURIComponent(data.requestId)}`, { cache: "no-store" }); const detail = await check.json(); if (!check.ok) throw new Error(detail.error); if (detail.status === "done") { videoUrl = detail.videoUrl; break; } if (["failed", "expired"].includes(detail.status)) throw new Error("视频生成失败，积分已退还"); } if (!videoUrl) throw new Error("视频仍在处理中，请稍后重试"); shot = await updateShot(shot.id, { videoUrl, status: "completed", error: "" }); working[index] = shot;
        }
        catch (error) { failures++; working[index] = await updateShot(shot.id, { status: "failed", error: error instanceof Error ? error.message : "视频生成失败" }); }
      }
      const voiceShots = working.filter((shot) => (!retryShotIds || retryShotIds.has(shot.id)) && shot.dialogue?.trim() && !shot.audio_url);
      for (let index = 0; index < voiceShots.length; index++) {
        const shot = voiceShots[index]; setStatus(`整集制作 4/5 · 补充配音与字幕 ${index + 1}/${voiceShots.length} · 镜头 ${shot.shot_number}`);
        try { const speaker = characters.find((character) => character.id === shot.speaker_character_id); const response = await fetch(`/api/storyboard/shots/${shot.id}/voice`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ voiceId: speaker?.voice_id || shot.voice_id, fallbackVoiceId: voiceId, language: speaker?.voice_language || shot.voice_language || voiceLanguage, batch: true }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error); const workingIndex = working.findIndex((item) => item.id === shot.id); if (workingIndex >= 0) working[workingIndex] = data.shot; setShots((current) => current.map((item) => item.id === shot.id ? data.shot : item)); }
        catch (error) { failures++; await updateShot(shot.id, { status: "failed", error: error instanceof Error ? error.message : "配音生成失败" }); }
      }
      const lipSyncShots = working.filter((shot) => (!retryShotIds || retryShotIds.has(shot.id)) && shot.video_url && shot.audio_url && requiresLipSync(shot) && !isLipSynced(shot));
      for (let index = 0; index < lipSyncShots.length; index++) {
        const shot = lipSyncShots[index]; setStatus(`整集制作 5/5 · 同步声音与口型 ${index + 1}/${lipSyncShots.length} · 镜头 ${shot.shot_number}`);
        try { const completedShot=await lipSyncOne(shot);const workingIndex=working.findIndex((item)=>item.id===shot.id);if(workingIndex>=0)working[workingIndex]=completedShot; }
        catch (error) { failures++; await updateShot(shot.id, { status: "failed", error: error instanceof Error ? error.message : "口型同步失败" }); }
      }
      const audited=working.filter((shot)=>!retryShotIds||retryShotIds.has(shot.id));const missingImages=audited.filter((shot)=>!shot.image_url).length;const missingVideos=audited.filter((shot)=>!shot.video_url).length;const missingVoices=audited.filter((shot)=>shot.dialogue?.trim()&&!shot.audio_url).length;const missingLipSync=audited.filter((shot)=>requiresLipSync(shot)&&!isLipSynced(shot)).length;const unfinishedIds=new Set(audited.filter((shot)=>!shot.image_url||!shot.video_url||(shot.dialogue?.trim()&&!shot.audio_url)||(requiresLipSync(shot)&&!isLipSynced(shot))).map((shot)=>shot.id));
      setStatus(unfinishedIds.size ? `整集制作尚有 ${unfinishedIds.size} 个镜头未完成：缺 ${missingImages} 张图片、${missingVideos} 段视频、${missingVoices} 段配音、${missingLipSync} 段角色口型；可点击重试失败任务${failures?`（本次捕获 ${failures} 个错误）`:""}` : "整集图片、情绪配音、视频、字幕和角色口型同步均已核验完成，可直接预览或导出");
    } finally { setBatching(false); }
  }

  function retryFailedTasks() {
    const failedIds = new Set(shots.filter(needsProductionRetry).map((shot) => shot.id));
    if (!failedIds.size) return setStatus("当前没有失败任务");
    void generateFullEpisode(failedIds);
  }

  function exportSrt() {
    let elapsed = 0; let index = 1;
    const stamp = (ms: number) => { const h = Math.floor(ms / 3600000); const m = Math.floor(ms % 3600000 / 60000); const s = Math.floor(ms % 60000 / 1000); const x = ms % 1000; return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")},${String(x).padStart(3,"0")}`; };
    const lines: string[] = [];
    for (const shot of shots.toSorted((a,b) => a.shot_number-b.shot_number)) { const start = elapsed; const spokenMs = Math.max(0, Number(shot.subtitle_end_ms ?? 0) - Number(shot.subtitle_start_ms ?? 0)); const end = start + Math.min(shot.duration_seconds * 1000, spokenMs || shot.duration_seconds * 1000); if (shot.dialogue?.trim()) { lines.push(`${index++}\n${stamp(start)} --> ${stamp(end)}\n${shot.dialogue.trim()}\n`); } elapsed += shot.duration_seconds * 1000; }
    if (!lines.length) return setStatus("当前分镜没有可导出的对白字幕");
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" })); const link = document.createElement("a"); link.href = url; link.download = `${currentTitle || "影动AI分镜"}.srt`; link.click(); URL.revokeObjectURL(url); setStatus("SRT 字幕已导出");
  }

  function sendToStudio(shot: Shot, mode: "image" | "video") { localStorage.setItem("yingdong-studio-draft", JSON.stringify({ prompt: mode === "image" ? shot.image_prompt : shot.video_prompt, mode, shotId: shot.id, projectId: currentProjectId, characterIds: effectiveCharacterIds(shot) })); router.push("/dashboard"); }

  return <main className="storyboard-page">
    <header className="admin-head"><Link className="wordmark" href="/"><span>影</span><b>影动 AI</b></Link><Link href="/dashboard">返回漫剧工作台</Link></header>
    <section className="storyboard-layout">
      <aside className="project-list"><p>分镜项目</p>{projects.map((project) => <button key={project.id} onClick={() => { setShots(project.storyboard_shots.toSorted((a,b) => a.shot_number-b.shot_number)); setCurrentTitle(project.title); setCurrentProjectId(project.id); setCharacterId(project.character_id || ""); }}>{project.title}<small>{new Date(project.created_at).toLocaleDateString("zh-CN")}</small></button>)}</aside>
      <div className="storyboard-main">
        <div className="storyboard-head"><p className="eyebrow">NOVEL TO STORYBOARD</p><h1>小说一键拆分镜</h1><p>粘贴一章小说，自动拆镜并批量生成整集图片、视频、配音与字幕。</p></div>
        <div className="story-template-picker"><label>爆款题材模板</label><div>{storyTemplates.map((template)=><button type="button" key={template.id} onClick={()=>applyStoryTemplate(template)}>{template.label}</button>)}</div><small>模板已写好人物目标、升级冲突、关键选择、直接后果和结尾钩子，选中后仍可自由修改。</small></div>
        <form className="storyboard-form" onSubmit={generate}><div><label>项目名称</label><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例如：第一章 黑雨"/></div><div><label>镜头数量</label><select value={shotCount} onChange={(e) => setShotCount(e.target.value)}><option value="3">3 个（质量样片）</option><option value="8">8 个</option><option value="12">12 个</option><option value="16">16 个</option><option value="20">20 个</option></select></div><textarea required minLength={30} value={story} onChange={(e) => setStory(e.target.value)} placeholder="粘贴小说章节、剧本或剧情梗概…"/><button disabled={loading}>{loading ? "正在拆分…" : "一键生成分镜"}</button></form>
        {status && <div className="character-status">{status}</div>}
        {shots.length > 0 && <div className="shot-section">
          <div className="batch-toolbar">
            <div><label>整集绑定角色</label><select value={characterId} onChange={(e) => void bindCharacter(e.target.value)}><option value="">不绑定角色</option>{characters.map((character) => <option value={character.id} key={character.id}>{character.name} V{character.version}</option>)}</select></div>
            <div><label>固定音色</label><select value={voiceId} onChange={(e) => setVoiceId(e.target.value)}>{characterVoiceOptions.map((voice)=><option key={voice.id} value={voice.id}>{voice.id[0].toUpperCase()}{voice.id.slice(1)} · {voice.label}</option>)}</select></div>
            <div><label>配音语言</label><select value={voiceLanguage} onChange={(e) => setVoiceLanguage(e.target.value)}><option value="zh">普通话</option><option value="en">英语</option><option value="ja">日语</option><option value="auto">自动识别（可尝试粤语）</option></select></div>
            <div><label>视频清晰度</label><select value={videoResolution} onChange={(e)=>setVideoResolution(e.target.value as "480p"|"720p")}><option value="720p">720p 高清 · 112积分/镜</option><option value="480p">480p 标准 · 80积分/镜</option></select></div>
            <button className="full-episode-button" disabled={batching} onClick={() => void generateFullEpisode()}>{batching ? "整集制作中…" : "一键生成整集漫剧"}</button>
            <button disabled={batching} onClick={runQualityCheck}>制作前质量检查</button>
            <button disabled={batching || !currentProjectId} onClick={() => void polishDialogue()}>AI 修复对白、情绪与连续性</button>
            {shots.some(needsProductionRetry) && <button className="retry-failed-button" disabled={batching} onClick={retryFailedTasks}>恢复或重试未完成任务 · {shots.filter(needsProductionRetry).length} 镜</button>}
            <button disabled={batching} onClick={batchImages}>批量生成图片 · {shots.filter((shot) => !shot.image_url).length} 镜</button>
            <button disabled={batching} onClick={batchVideos}>批量图片转视频 · {shots.filter((shot) => shot.image_url && !shot.video_url).length} 镜</button>
            <button disabled={batching} onClick={batchVoices}>批量生成配音 · {shots.filter((shot) => shot.dialogue?.trim() && !shot.audio_url).length} 镜</button>
            <button disabled={batching} onClick={() => void batchLipSync()}>批量同步口型 · {shots.filter((shot) => shot.video_url && shot.audio_url && requiresLipSync(shot) && !isLipSynced(shot)).length} 镜</button>
            <button disabled={batching} onClick={exportSrt}>导出 SRT 字幕</button>
          </div>
          <div className="shot-title"><h2>{currentTitle}</h2><span>共 {shots.length} 镜 · 约 {shots.reduce((sum, shot) => sum + shot.duration_seconds, 0)} 秒</span>{currentProjectId && <button className="sequel-button" disabled={loading || batching} onClick={() => void continueProject()}>{loading ? "续写中…" : "AI 续写下一集"}</button>}{currentProjectId && <Link className="episode-link" href={`/episode/${currentProjectId}`}>整集自动剪辑预览 →</Link>}</div>
          <div className="shot-list">{shots.map((shot) => <article key={shot.shot_number}>
            {shot.image_url && <Image className="shot-preview" src={shot.image_url} alt={`镜头${shot.shot_number}`} width={600} height={1067} unoptimized/>}
            {shot.video_url && <video className="shot-preview" src={shot.video_url} controls playsInline/>}
            {shot.audio_url && <audio className="shot-audio" src={shot.audio_url} controls/>}
            <div className="shot-number">镜头 {String(shot.shot_number).padStart(2,"0")}<b>{shot.duration_seconds}s</b></div>
            <div className="shot-tags"><span>{shot.shot_type}</span><span>{shot.camera}</span>{shot.speaker_character_id && <span>对白：{characters.find((character) => character.id === shot.speaker_character_id)?.name}</span>}{shot.media_status && <span>{shot.media_status}</span>}{shot.audio_url && <span>{shot.voice_id} · 已配音</span>}</div>
            {shot.dialogue?.trim() && <label className="shot-speaker">说话角色<select value={shot.speaker_character_id || ""} onChange={async(event)=>{try{await updateShot(shot.id,{speakerCharacterId:event.target.value||null});setStatus(`镜头 ${shot.shot_number} 的说话角色已更新，请重新生成配音和口型`);}catch(error){setStatus(error instanceof Error?error.message:"保存说话角色失败");}}}><option value="">旁白 / 未指定</option>{characters.map((character)=><option key={character.id} value={character.id}>{character.name} · {character.voice_id}</option>)}</select></label>}
            {shot.dialogue?.trim() && <div className="shot-templates"><b>情绪表演</b>{([['tender','温柔'],['nervous','紧张'],['angry','愤怒'],['grieving','悲伤'],['determined','坚定']] as const).map(([preset,label])=><button key={preset} disabled={batching} onClick={async()=>{try{const updated=await updateShot(shot.id,{performancePreset:preset});setShots((current)=>current.map((item)=>item.id===shot.id?updated:item));setStatus(`镜头 ${shot.shot_number} 已切换为${label}表演，请重新生成配音和口型`);}catch(error){setStatus(error instanceof Error?error.message:"保存情绪失败");}}}>{label}</button>)}</div>}
            <h3>{shot.scene}</h3><p><b>动作</b>{shot.action}</p>{shot.sound && <p><b>情绪/声音</b>{shot.sound}</p>}{shot.dialogue && <p><b>对白/字幕</b>{shot.dialogue}</p>}{shot.error_message && <p className="shot-error"><b>错误</b>{shot.error_message}</p>}
            {missingCharacterNames(shot).length > 0 && <div className="missing-characters"><b>缺少角色设定</b>{missingCharacterNames(shot).map((name) => <Link key={name} href={`/characters?name=${encodeURIComponent(name)}`}>创建 {name} →</Link>)}</div>}
            <div className="shot-templates"><b>镜头模板</b><button onClick={() => void applyShotTemplate(shot,"closeup","特写")}>特写</button><button onClick={() => void applyShotTemplate(shot,"near","近景")}>近景</button><button onClick={() => void applyShotTemplate(shot,"medium","中景")}>中景</button><button onClick={() => void applyShotTemplate(shot,"wide","远景")}>远景</button></div>
            <details><summary>绑定镜头角色 · {effectiveCharacterIds(shot).length} 人</summary><div>{characters.map((character) => <label key={character.id}><input type="checkbox" checked={effectiveCharacterIds(shot).includes(character.id)} onChange={(event) => void toggleShotCharacter(shot, character.id, event.target.checked)}/>{character.name} V{character.version}</label>)}</div></details>
            <details><summary>查看生成提示词</summary><div><b>图片</b><p>{shot.image_prompt}</p><b>视频</b><p>{shot.video_prompt}</p></div></details>
            <div className="shot-actions"><button onClick={() => sendToStudio(shot,"image")}>单张生成 ↗</button><button onClick={() => sendToStudio(shot,"video")}>单镜视频 ↗</button>{shot.dialogue?.trim() && <button disabled={batching} onClick={() => void regenerateVoice(shot)}>{shot.audio_url ? "重新配音并试听" : "生成配音"}</button>}{shot.video_url && shot.audio_url && requiresLipSync(shot) && <button disabled={batching || isLipSynced(shot)} onClick={() => void batchLipSync(shot)}>{isLipSynced(shot) ? "口型已同步" : "同步声音与口型"}</button>}</div>
          </article>)}</div>
        </div>}
      </div>
    </section>
  </main>;
}
