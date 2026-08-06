"use client";

import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/app/lib/supabase";

type Shot = { id: string; shot_number: number; duration_seconds: number; shot_type: string; camera: string; scene: string; action: string; dialogue: string; sound: string; image_prompt: string; video_prompt: string; image_url?: string; video_url?: string; audio_url?: string; voice_id?: string; voice_language?: string; subtitle_start_ms?: number; subtitle_end_ms?: number; media_status?: string; error_message?: string };
type Project = { id: string; title: string; created_at: string; storyboard_shots: Shot[] };
type Character = { id: string; name: string; version: number };

export default function StoryboardPage() {
  const router = useRouter();
  const [story, setStory] = useState(""); const [title, setTitle] = useState(""); const [shotCount, setShotCount] = useState("12");
  const [shots, setShots] = useState<Shot[]>([]); const [projects, setProjects] = useState<Project[]>([]); const [characters, setCharacters] = useState<Character[]>([]);
  const [currentTitle, setCurrentTitle] = useState(""); const [characterId, setCharacterId] = useState(""); const [voiceId, setVoiceId] = useState("orion"); const [voiceLanguage, setVoiceLanguage] = useState("zh"); const [loading, setLoading] = useState(false); const [batching, setBatching] = useState(false); const [status, setStatus] = useState("");

  useEffect(() => { supabase.auth.getUser().then(async ({ data }) => { if (!data.user) { router.replace("/login"); return; } const [response, characterResult] = await Promise.all([fetch("/api/storyboard", { cache: "no-store" }), supabase.from("characters").select("id,name,version").order("updated_at", { ascending: false })]); if (response.ok) setProjects((await response.json()).projects); setCharacters((characterResult.data ?? []) as Character[]); }); }, [router]);

  async function generate(event: FormEvent) {
    event.preventDefault(); setLoading(true); setStatus("AI 导演正在拆分镜头…"); setShots([]);
    try { const response = await fetch("/api/storyboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, story, shotCount: Number(shotCount) }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error); setShots(data.shots); setCurrentTitle(data.project.title); setProjects((current) => [{ ...data.project, storyboard_shots: data.shots }, ...current]); setStatus(`已生成 ${data.shots.length} 个镜头，剩余 ${data.credits} 积分`); }
    catch (error) { setStatus(error instanceof Error ? error.message : "拆分镜失败"); } finally { setLoading(false); }
  }

  async function updateShot(id: string, body: Record<string, string>) { const response = await fetch(`/api/storyboard/shots/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); if (!response.ok) throw new Error((await response.json()).error || "保存镜头失败"); setShots((current) => current.map((shot) => shot.id === id ? { ...shot, image_url: body.imageUrl ?? shot.image_url, video_url: body.videoUrl ?? shot.video_url, media_status: body.status ?? shot.media_status, error_message: body.error } : shot)); }

  async function batchImages() {
    const pending = shots.filter((shot) => !shot.image_url); if (!pending.length) return setStatus("所有镜头都已有图片");
    if (!window.confirm(`将生成 ${pending.length} 张图片，预计消耗 ${pending.length * 20} 积分。确定继续吗？`)) return;
    setBatching(true);
    for (let index = 0; index < pending.length; index++) { const shot = pending[index]; setStatus(`正在生成图片 ${index + 1}/${pending.length} · 镜头 ${shot.shot_number}`); try { await updateShot(shot.id, { status: "image_generating", error: "" }); const response = await fetch("/api/image", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: shot.image_prompt, aspectRatio: "9:16", characterId: characterId || undefined, batch: true }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error); await updateShot(shot.id, { imageUrl: data.imageUrl, status: "image_ready", error: "" }); } catch (error) { await updateShot(shot.id, { status: "failed", error: error instanceof Error ? error.message : "图片生成失败" }); } }
    setBatching(false); setStatus("批量图片生成完成");
  }

  async function batchVideos() {
    const pending = shots.filter((shot) => shot.image_url && !shot.video_url); if (!pending.length) return setStatus("没有等待转视频的分镜图片");
    if (!window.confirm(`将生成 ${pending.length} 段视频，预计消耗 ${pending.length * 80} 积分。过程可能需要较长时间，确定继续吗？`)) return;
    setBatching(true);
    for (let index = 0; index < pending.length; index++) { const shot = pending[index]; setStatus(`正在生成视频 ${index + 1}/${pending.length} · 镜头 ${shot.shot_number}`); try { await updateShot(shot.id, { status: "video_generating", error: "" }); const response = await fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: "xai", prompt: shot.video_prompt, image: shot.image_url, duration: Math.min(15, shot.duration_seconds), aspectRatio: "9:16", resolution: "480p", characterId: characterId || undefined, batch: true }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error); let videoUrl = ""; for (let attempt = 0; attempt < 120; attempt++) { await new Promise((resolve) => setTimeout(resolve, 5000)); const check = await fetch(`/api/status?requestId=${encodeURIComponent(data.requestId)}`, { cache: "no-store" }); const detail = await check.json(); if (!check.ok) throw new Error(detail.error); if (detail.status === "done") { videoUrl = detail.videoUrl; break; } if (["failed", "expired"].includes(detail.status)) throw new Error("视频生成失败，积分已退还"); } if (!videoUrl) throw new Error("视频仍在处理中，请稍后重试"); await updateShot(shot.id, { videoUrl, status: "completed", error: "" }); } catch (error) { await updateShot(shot.id, { status: "failed", error: error instanceof Error ? error.message : "视频生成失败" }); } }
    setBatching(false); setStatus("批量视频生成完成");
  }

  async function batchVoices() {
    const pending = shots.filter((shot) => shot.dialogue?.trim() && !shot.audio_url);
    if (!pending.length) return setStatus("所有有对白的镜头都已有配音");
    if (!window.confirm(`将生成 ${pending.length} 段配音，预计消耗 ${pending.length * 2} 积分。确定继续吗？`)) return;
    setBatching(true);
    for (let index = 0; index < pending.length; index++) {
      const shot = pending[index]; setStatus(`正在生成配音 ${index + 1}/${pending.length} · 镜头 ${shot.shot_number}`);
      try {
        const response = await fetch(`/api/storyboard/shots/${shot.id}/voice`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ voiceId, language: voiceLanguage, batch: true }) });
        const data = await response.json(); if (!response.ok) throw new Error(data.error);
        setShots((current) => current.map((item) => item.id === shot.id ? data.shot : item));
      } catch (error) { setStatus(error instanceof Error ? error.message : "配音生成失败"); }
    }
    setBatching(false); setStatus("批量配音与字幕时间轴生成完成");
  }

  function exportSrt() {
    let elapsed = 0; let index = 1;
    const stamp = (ms: number) => { const h = Math.floor(ms / 3600000); const m = Math.floor(ms % 3600000 / 60000); const s = Math.floor(ms % 60000 / 1000); const x = ms % 1000; return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")},${String(x).padStart(3,"0")}`; };
    const lines: string[] = [];
    for (const shot of shots.toSorted((a,b) => a.shot_number-b.shot_number)) { const start = elapsed; const end = start + shot.duration_seconds * 1000; if (shot.dialogue?.trim()) { lines.push(`${index++}\n${stamp(start)} --> ${stamp(end)}\n${shot.dialogue.trim()}\n`); } elapsed = end; }
    if (!lines.length) return setStatus("当前分镜没有可导出的对白字幕");
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" })); const link = document.createElement("a"); link.href = url; link.download = `${currentTitle || "影动AI分镜"}.srt`; link.click(); URL.revokeObjectURL(url); setStatus("SRT 字幕已导出");
  }

  function sendToStudio(prompt: string, mode: "image" | "video") { localStorage.setItem("yingdong-studio-draft", JSON.stringify({ prompt, mode })); router.push("/dashboard"); }

  return <main className="storyboard-page">
    <header className="admin-head"><Link className="wordmark" href="/"><span>影</span><b>影动 AI</b></Link><Link href="/dashboard">返回漫剧工作台</Link></header>
    <section className="storyboard-layout">
      <aside className="project-list"><p>分镜项目</p>{projects.map((project) => <button key={project.id} onClick={() => { setShots(project.storyboard_shots.toSorted((a,b) => a.shot_number-b.shot_number)); setCurrentTitle(project.title); }}>{project.title}<small>{new Date(project.created_at).toLocaleDateString("zh-CN")}</small></button>)}</aside>
      <div className="storyboard-main">
        <div className="storyboard-head"><p className="eyebrow">NOVEL TO STORYBOARD</p><h1>小说一键拆分镜</h1><p>粘贴一章小说，自动拆镜并批量生成整集图片、视频、配音与字幕。</p></div>
        <form className="storyboard-form" onSubmit={generate}><div><label>项目名称</label><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例如：第一章 黑雨"/></div><div><label>镜头数量</label><select value={shotCount} onChange={(e) => setShotCount(e.target.value)}><option value="8">8 个</option><option value="12">12 个</option><option value="16">16 个</option><option value="20">20 个</option></select></div><textarea required minLength={30} value={story} onChange={(e) => setStory(e.target.value)} placeholder="粘贴小说章节、剧本或剧情梗概…"/><button disabled={loading}>{loading ? "正在拆分…" : "一键生成分镜"}</button></form>
        {status && <div className="character-status">{status}</div>}
        {shots.length > 0 && <div className="shot-section">
          <div className="batch-toolbar">
            <div><label>绑定角色</label><select value={characterId} onChange={(e) => setCharacterId(e.target.value)}><option value="">不绑定角色</option>{characters.map((character) => <option value={character.id} key={character.id}>{character.name} V{character.version}</option>)}</select></div>
            <div><label>固定音色</label><select value={voiceId} onChange={(e) => setVoiceId(e.target.value)}><option value="orion">Orion · 电影旁白</option><option value="carina">Carina · 温柔女声</option><option value="zagan">Zagan · 戏剧角色</option><option value="luna">Luna · 亲和女声</option><option value="iris">Iris · 活泼女声</option><option value="perseus">Perseus · 自信男声</option></select></div>
            <div><label>配音语言</label><select value={voiceLanguage} onChange={(e) => setVoiceLanguage(e.target.value)}><option value="zh">普通话</option><option value="en">英语</option><option value="ja">日语</option><option value="auto">自动识别（可尝试粤语）</option></select></div>
            <button disabled={batching} onClick={batchImages}>批量生成图片 · {shots.filter((shot) => !shot.image_url).length} 镜</button>
            <button disabled={batching} onClick={batchVideos}>批量图片转视频 · {shots.filter((shot) => shot.image_url && !shot.video_url).length} 镜</button>
            <button disabled={batching} onClick={batchVoices}>批量生成配音 · {shots.filter((shot) => shot.dialogue?.trim() && !shot.audio_url).length} 镜</button>
            <button disabled={batching} onClick={exportSrt}>导出 SRT 字幕</button>
          </div>
          <div className="shot-title"><h2>{currentTitle}</h2><span>共 {shots.length} 镜 · 约 {shots.reduce((sum, shot) => sum + shot.duration_seconds, 0)} 秒</span></div>
          <div className="shot-list">{shots.map((shot) => <article key={shot.shot_number}>
            {shot.image_url && <Image className="shot-preview" src={shot.image_url} alt={`镜头${shot.shot_number}`} width={600} height={1067} unoptimized/>}
            {shot.video_url && <video className="shot-preview" src={shot.video_url} controls playsInline/>}
            {shot.audio_url && <audio className="shot-audio" src={shot.audio_url} controls/>}
            <div className="shot-number">镜头 {String(shot.shot_number).padStart(2,"0")}<b>{shot.duration_seconds}s</b></div>
            <div className="shot-tags"><span>{shot.shot_type}</span><span>{shot.camera}</span>{shot.media_status && <span>{shot.media_status}</span>}{shot.audio_url && <span>{shot.voice_id} · 已配音</span>}</div>
            <h3>{shot.scene}</h3><p><b>动作</b>{shot.action}</p>{shot.dialogue && <p><b>对白/字幕</b>{shot.dialogue}</p>}{shot.error_message && <p className="shot-error"><b>错误</b>{shot.error_message}</p>}
            <details><summary>查看生成提示词</summary><div><b>图片</b><p>{shot.image_prompt}</p><b>视频</b><p>{shot.video_prompt}</p></div></details>
            <div className="shot-actions"><button onClick={() => sendToStudio(shot.image_prompt,"image")}>单张生成 ↗</button><button onClick={() => sendToStudio(shot.video_prompt,"video")}>单镜视频 ↗</button></div>
          </article>)}</div>
        </div>}
      </div>
    </section>
  </main>;
}
