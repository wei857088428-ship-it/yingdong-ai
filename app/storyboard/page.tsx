"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/app/lib/supabase";

type Shot = { id?: string; shot_number: number; duration_seconds: number; shot_type: string; camera: string; scene: string; action: string; dialogue: string; sound: string; image_prompt: string; video_prompt: string };
type Project = { id: string; title: string; created_at: string; storyboard_shots: Shot[] };

export default function StoryboardPage() {
  const router = useRouter(); const [story, setStory] = useState(""); const [title, setTitle] = useState(""); const [shotCount, setShotCount] = useState("12");
  const [shots, setShots] = useState<Shot[]>([]); const [projects, setProjects] = useState<Project[]>([]); const [currentTitle, setCurrentTitle] = useState(""); const [loading, setLoading] = useState(false); const [status, setStatus] = useState("");

  useEffect(() => { supabase.auth.getUser().then(async ({ data }) => { if (!data.user) { router.replace("/login"); return; } const response = await fetch("/api/storyboard", { cache: "no-store" }); if (response.ok) setProjects((await response.json()).projects); }); }, [router]);

  async function generate(event: FormEvent) {
    event.preventDefault(); setLoading(true); setStatus("AI 导演正在拆分镜头…"); setShots([]);
    try { const response = await fetch("/api/storyboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, story, shotCount: Number(shotCount) }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error); setShots(data.shots); setCurrentTitle(data.project.title); setProjects((current) => [{ ...data.project, storyboard_shots: data.shots }, ...current]); setStatus(`已生成 ${data.shots.length} 个镜头，剩余 ${data.credits} 积分`); }
    catch (error) { setStatus(error instanceof Error ? error.message : "拆分镜失败"); } finally { setLoading(false); }
  }

  function sendToStudio(prompt: string, mode: "image" | "video") { localStorage.setItem("yingdong-studio-draft", JSON.stringify({ prompt, mode })); router.push("/dashboard"); }

  return <main className="storyboard-page"><header className="admin-head"><Link className="wordmark" href="/"><span>影</span><b>影动 AI</b></Link><Link href="/dashboard">返回漫剧工作台</Link></header><section className="storyboard-layout"><aside className="project-list"><p>分镜项目</p>{projects.map((project) => <button key={project.id} onClick={() => { setShots(project.storyboard_shots.toSorted((a,b) => a.shot_number-b.shot_number)); setCurrentTitle(project.title); }}>{project.title}<small>{new Date(project.created_at).toLocaleDateString("zh-CN")}</small></button>)}</aside><div className="storyboard-main"><div className="storyboard-head"><p className="eyebrow">NOVEL TO STORYBOARD</p><h1>小说一键拆分镜</h1><p>粘贴一章小说或剧情，自动得到可直接生成的完整镜头清单。</p></div><form className="storyboard-form" onSubmit={generate}><div><label>项目名称</label><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例如：第一章 黑雨"/></div><div><label>镜头数量</label><select value={shotCount} onChange={(e) => setShotCount(e.target.value)}><option value="8">8 个</option><option value="12">12 个</option><option value="16">16 个</option><option value="20">20 个</option></select></div><textarea required minLength={30} value={story} onChange={(e) => setStory(e.target.value)} placeholder="粘贴小说章节、剧本或剧情梗概…"/><button disabled={loading}>{loading ? "正在拆分…" : "一键生成分镜"}</button></form>{status && <div className="character-status">{status}</div>}{shots.length > 0 && <div className="shot-section"><div className="shot-title"><h2>{currentTitle}</h2><span>共 {shots.length} 镜 · 约 {shots.reduce((sum, shot) => sum + shot.duration_seconds, 0)} 秒</span></div><div className="shot-list">{shots.map((shot) => <article key={shot.shot_number}><div className="shot-number">镜头 {String(shot.shot_number).padStart(2,"0")}<b>{shot.duration_seconds}s</b></div><div className="shot-tags"><span>{shot.shot_type}</span><span>{shot.camera}</span></div><h3>{shot.scene}</h3><p><b>动作</b>{shot.action}</p>{shot.dialogue && <p><b>对白</b>{shot.dialogue}</p>}{shot.sound && <p><b>声音</b>{shot.sound}</p>}<details><summary>查看生成提示词</summary><div><b>图片</b><p>{shot.image_prompt}</p><b>视频</b><p>{shot.video_prompt}</p></div></details><div className="shot-actions"><button onClick={() => sendToStudio(shot.image_prompt,"image")}>生成画面 ↗</button><button onClick={() => sendToStudio(shot.video_prompt,"video")}>生成视频 ↗</button></div></article>)}</div></div>}</div></section></main>;
}
