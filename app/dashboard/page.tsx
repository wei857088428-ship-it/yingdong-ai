"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { supabase } from "../lib/supabase";

type Mode = "chat" | "image" | "video";
type Message = { role: "user" | "assistant"; content: string; imageUrl?: string; videoUrl?: string };
type Conversation = { id: string; title: string; mode: Mode; updated_at: string };
type Work = { id: string; type: "image" | "video"; prompt: string; url: string | null; status: string; created_at: string };

const starters = ["帮我策划一部三集悬疑漫剧", "写一个有反转的短视频脚本", "生成国漫电影感角色海报", "把这张图片变成动态镜头"];

export default function Dashboard() {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>("chat");
  const [panel, setPanel] = useState<"create" | "works">("create");
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [works, setWorks] = useState<Work[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [credits, setCredits] = useState(0);
  const [duration, setDuration] = useState("5");
  const [ratio, setRatio] = useState("9:16");
  const [resolution, setResolution] = useState("480p");
  const [imageData, setImageData] = useState("");
  const [imageName, setImageName] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  const refreshLibrary = useCallback(async () => {
    const response = await fetch("/api/conversations", { cache: "no-store" });
    if (response.ok) { const data = await response.json(); setConversations(data.conversations); setWorks(data.works); }
  }, []);

  useEffect(() => {
    Promise.all([supabase.auth.getUser(), fetch("/api/conversations", { cache: "no-store" })]).then(async ([{ data }, libraryResponse]) => {
      if (!data.user) { router.replace("/login"); return; }
      if (libraryResponse.ok) { const library = await libraryResponse.json(); setConversations(library.conversations); setWorks(library.works); }
      setEmail(data.user.email || "");
      const { data: profile } = await supabase.from("profiles").select("credits").eq("id", data.user.id).single();
      setCredits(profile?.credits ?? 0);
    });
  }, [router]);

  async function openConversation(id: string) {
    setLoading(true); setStatus("正在读取历史对话…"); setPanel("create");
    try {
      const response = await fetch(`/api/conversations/${id}`, { cache: "no-store" });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      setConversationId(id); setMode(data.conversation.mode);
      setMessages(data.messages.map((item: { role: "user" | "assistant"; content: string; media_url?: string; media_type?: string }) => ({ role: item.role, content: item.content, imageUrl: item.media_type === "image" ? item.media_url : undefined, videoUrl: item.media_type === "video" ? item.media_url : undefined })));
      setStatus("");
    } catch (error) { setStatus(error instanceof Error ? error.message : "读取历史失败"); }
    finally { setLoading(false); }
  }

  async function signOut() { await supabase.auth.signOut(); router.replace("/"); router.refresh(); }

  function handleImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) { setStatus("请选择 5MB 以内的 JPG 或 PNG 图片"); return; }
    const reader = new FileReader(); reader.onload = () => { setImageData(String(reader.result)); setImageName(file.name); setStatus(""); }; reader.readAsDataURL(file);
  }

  async function submit(event?: FormEvent) {
    event?.preventDefault(); const text = prompt.trim(); if (!text || loading) return;
    const userMessage: Message = { role: "user", content: text }; const nextMessages = [...messages, userMessage];
    setMessages(nextMessages); setPrompt(""); setLoading(true); setStatus(mode === "chat" ? "影动正在思考…" : mode === "image" ? "正在绘制图片…" : "正在生成视频…");
    try {
      if (mode === "chat") {
        const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: nextMessages.map(({ role, content }) => ({ role, content })), conversationId }) });
        const data = await response.json(); if (response.status === 401) return router.replace("/login"); if (!response.ok) throw new Error(data.error || "对话失败");
        setConversationId(data.conversationId); setCredits(data.credits); setMessages([...nextMessages, { role: "assistant", content: data.content }]);
      } else if (mode === "image") {
        const response = await fetch("/api/image", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: text, aspectRatio: ratio, conversationId }) });
        const data = await response.json(); if (!response.ok) throw new Error(data.error || "图片生成失败");
        setConversationId(data.conversationId); setCredits(data.credits); setMessages([...nextMessages, { role: "assistant", content: "图片已经生成，可以打开或下载保存。", imageUrl: data.imageUrl }]);
      } else {
        const response = await fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: "xai", prompt: text, image: imageData || undefined, duration: Number(duration), aspectRatio: ratio, resolution, conversationId }) });
        const data = await response.json(); if (!response.ok) throw new Error(data.error || "视频任务提交失败");
        setConversationId(data.conversationId); setCredits(data.credits);
        for (let attempt = 0; attempt < 120; attempt++) {
          await new Promise((resolve) => setTimeout(resolve, 5000));
          const result = await fetch(`/api/status?requestId=${encodeURIComponent(data.requestId)}`, { cache: "no-store" }); const detail = await result.json();
          if (!result.ok) throw new Error(detail.error || "查询视频状态失败");
          if (typeof detail.credits === "number") setCredits(detail.credits);
          if (detail.status === "done") { setMessages([...nextMessages, { role: "assistant", content: "视频已经生成完成。", videoUrl: detail.videoUrl }]); setStatus(""); setLoading(false); await refreshLibrary(); return; }
          if (["failed", "expired"].includes(detail.status)) throw new Error("视频生成失败，积分已自动退还");
          setStatus(`视频生成中 · ${detail.progress ?? "请稍候"}${detail.progress ? "%" : ""}`);
        }
        throw new Error("生成等待超时，请稍后在作品库查看");
      }
      setStatus(""); await refreshLibrary();
    } catch (error) { setStatus(error instanceof Error ? error.message : "发生未知错误"); }
    finally { setLoading(false); }
  }

  function newConversation() { setConversationId(null); setMessages([]); setPrompt(""); setStatus(""); setImageData(""); setImageName(""); setPanel("create"); }

  return <main className="ai-shell">
    <aside className="sidebar">
      <Link className="wordmark" href="/"><span>影</span><b>影动 AI</b></Link>
      <button className="new-chat" onClick={newConversation}>＋ 新建创作</button>
      <nav className="side-nav"><button className={panel === "create" ? "active" : ""} onClick={() => setPanel("create")}>✦ 当前会话</button><button className={panel === "works" ? "active" : ""} onClick={() => setPanel("works")}>▧ 我的作品</button><Link href="/admin">⌁ 运营后台</Link></nav>
      <div className="recent"><p>历史会话</p>{conversations.length ? conversations.slice(0, 8).map((item) => <button key={item.id} onClick={() => openConversation(item.id)} title={item.title}>{item.title}</button>) : <span>还没有历史记录</span>}</div>
      <div className="account"><div className="avatar">{email.slice(0, 1).toUpperCase() || "Y"}</div><div><b>{email.split("@")[0] || "创作者"}</b><small>{credits} 积分</small></div><button onClick={signOut} title="退出登录">↗</button></div>
    </aside>
    <section className="studio">
      <header className="studio-head"><div><b>影动 1.1</b><span>{panel === "works" ? "作品库" : `${mode === "chat" ? "对话" : mode === "image" ? "图片" : "视频"}模式`}</span></div><Link href="/">返回首页</Link></header>
      {panel === "works" ? <div className="works-view"><div className="works-heading"><p className="eyebrow">CREATIVE LIBRARY</p><h1>我的作品</h1><span>图片和视频生成完成后会自动保存在这里。</span></div><div className="works-grid">{works.map((work) => <article className="work-card" key={work.id}>{work.url && work.type === "image" ? <Image src={work.url} alt={work.prompt} width={600} height={600} unoptimized/> : work.url ? <video src={work.url} controls playsInline/> : <div className="work-processing">{work.status === "failed" ? "生成失败" : "正在生成…"}</div>}<div><b>{work.type === "image" ? "图片" : "视频"}</b><p>{work.prompt}</p></div></article>)}</div>{!works.length && <div className="admin-notice">还没有作品，先去生成一张图片或一段视频吧。</div>}</div> : <>
        <div className={`conversation ${messages.length ? "has-messages" : ""}`}>{messages.length === 0 ? <div className="welcome"><div className="spark">✦</div><h1>今天想创造什么？</h1><p>对话、写作、绘图和视频生成，都可以从一句话开始。</p><div className="starters">{starters.map((item) => <button key={item} onClick={() => setPrompt(item)}>{item}<span>↗</span></button>)}</div></div> : <div className="message-list">{messages.map((message, index) => <article className={`message ${message.role}`} key={`${message.role}-${index}`}><div className="message-avatar">{message.role === "assistant" ? "✦" : "你"}</div><div><p>{message.content}</p>{message.imageUrl && <a href={message.imageUrl} target="_blank" rel="noreferrer"><Image src={message.imageUrl} alt="AI 生成作品" width={1024} height={1024} unoptimized/></a>}{message.videoUrl && <video src={message.videoUrl} controls playsInline/>}</div></article>)}</div>}</div>
        <form className="composer" onSubmit={submit}><div className="mode-tabs">{(["chat", "image", "video"] as Mode[]).map((item) => <button type="button" className={mode === item ? "active" : ""} key={item} onClick={() => setMode(item)}>{item === "chat" ? "✦ 对话" : item === "image" ? "▧ 图片" : "▷ 视频"}</button>)}</div><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submit(); } }} placeholder={mode === "chat" ? "问影动任何问题…" : mode === "image" ? "描述你想生成的画面…" : "描述镜头、角色动作、场景和风格…"}/>{mode === "video" && <div className="video-options"><select value={duration} onChange={(e) => setDuration(e.target.value)}><option value="5">5 秒</option><option value="10">10 秒</option><option value="15">15 秒</option></select><select value={ratio} onChange={(e) => setRatio(e.target.value)}><option value="9:16">9:16 竖屏</option><option value="16:9">16:9 横屏</option><option value="1:1">1:1 方形</option></select><select value={resolution} onChange={(e) => setResolution(e.target.value)}><option value="480p">480p</option><option value="720p">720p</option></select></div>}<div className="composer-actions"><div><button type="button" className="attach" onClick={() => fileInput.current?.click()}>＋</button><input ref={fileInput} type="file" accept="image/*" hidden onChange={handleImage}/>{imageName && <span className="file-chip">▧ {imageName}<button type="button" onClick={() => { setImageData(""); setImageName(""); }}>×</button></span>}</div><button className="send" disabled={!prompt.trim() || loading} aria-label="发送">{loading ? "…" : "↑"}</button></div>{status && <p className="status">{status}</p>}</form><p className="disclaimer">AI 生成内容可能存在错误，重要信息请自行核实。</p>
      </>}
    </section>
  </main>;
}
