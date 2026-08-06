"use client";

import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { supabase } from "../lib/supabase";

type Mode = "chat" | "image" | "video";
type Message = { role: "user" | "assistant"; content: string; imageUrl?: string; videoUrl?: string };

const starters = ["帮我策划一部三集悬疑漫剧", "写一个有反转的短视频脚本", "生成国漫电影感角色海报", "把这张图片变成动态镜头"];

export default function Dashboard() {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>("chat");
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [email, setEmail] = useState("");
  const [credits, setCredits] = useState(0);
  const [duration, setDuration] = useState("5");
  const [ratio, setRatio] = useState("9:16");
  const [resolution, setResolution] = useState("480p");
  const [imageData, setImageData] = useState("");
  const [imageName, setImageName] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    async function loadUser() {
      const { data } = await supabase.auth.getUser();
      if (!data.user) { router.replace("/login"); return; }
      setEmail(data.user.email || "");
      const { data: profile } = await supabase.from("profiles").select("credits").eq("id", data.user.id).single();
      setCredits(profile?.credits ?? 1000);
    }
    loadUser();
  }, [router]);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/");
    router.refresh();
  }

  function handleImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) {
      setStatus("请选择 5MB 以内的 JPG 或 PNG 图片");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => { setImageData(String(reader.result)); setImageName(file.name); setStatus(""); };
    reader.readAsDataURL(file);
  }

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    const text = prompt.trim();
    if (!text || loading) return;
    const userMessage: Message = { role: "user", content: text };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages); setPrompt(""); setLoading(true); setStatus(mode === "chat" ? "影动正在思考…" : mode === "image" ? "正在绘制图片…" : "正在生成视频…");

    try {
      if (mode === "chat") {
        const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: nextMessages.map(({ role, content }) => ({ role, content })) }) });
        const data = await response.json();
        if (response.status === 401) return router.replace("/login");
        if (!response.ok) throw new Error(data.error || "对话失败");
        setMessages([...nextMessages, { role: "assistant", content: data.content }]);
      } else if (mode === "image") {
        const response = await fetch("/api/image", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: text, aspectRatio: ratio }) });
        const data = await response.json();
        if (response.status === 401) return router.replace("/login");
        if (!response.ok) throw new Error(data.error || "图片生成失败");
        setMessages([...nextMessages, { role: "assistant", content: "图片已经生成，可以打开或下载保存。", imageUrl: data.imageUrl }]);
      } else {
        const response = await fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: "xai", prompt: text, image: imageData || undefined, duration: Number(duration), aspectRatio: ratio, resolution }) });
        const data = await response.json();
        if (response.status === 401) return router.replace("/login");
        if (!response.ok) throw new Error(data.error || "视频任务提交失败");
        const requestId = data.requestId;
        for (let attempt = 0; attempt < 120; attempt++) {
          await new Promise((resolve) => setTimeout(resolve, 5000));
          const result = await fetch(`/api/status?requestId=${encodeURIComponent(requestId)}`, { cache: "no-store" });
          const detail = await result.json();
          if (!result.ok) throw new Error(detail.error || "查询视频状态失败");
          if (detail.status === "done") {
            setMessages([...nextMessages, { role: "assistant", content: "视频已经生成完成。", videoUrl: detail.videoUrl }]);
            setStatus(""); setLoading(false); return;
          }
          if (["failed", "expired"].includes(detail.status)) throw new Error("视频生成失败，请调整提示词后重试");
          setStatus(`视频生成中 · ${detail.progress ?? "请稍候"}${detail.progress ? "%" : ""}`);
        }
        throw new Error("生成等待超时，请稍后再试");
      }
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "发生未知错误");
    } finally { setLoading(false); }
  }

  function newConversation() { setMessages([]); setPrompt(""); setStatus(""); setImageData(""); setImageName(""); }

  return (
    <main className="ai-shell">
      <aside className="sidebar">
        <Link className="wordmark" href="/"><span>影</span><b>影动 AI</b></Link>
        <button className="new-chat" onClick={newConversation}>＋ 新建创作</button>
        <nav className="side-nav"><button className="active">✦ 当前会话</button><button onClick={() => setMode("image")}>▧ 图片创作</button><button onClick={() => setMode("video")}>▷ 视频创作</button><Link href="/admin">⌁ 运营后台</Link></nav>
        <div className="recent"><p>最近使用</p><span>AI 漫剧创作助手</span><span>短视频脚本策划</span></div>
        <div className="account"><div className="avatar">{email.slice(0, 1).toUpperCase() || "Y"}</div><div><b>{email.split("@")[0] || "创作者"}</b><small>{credits} 积分</small></div><button onClick={signOut} title="退出登录">↗</button></div>
      </aside>

      <section className="studio">
        <header className="studio-head"><div><b>影动 1.0</b><span>创作模式</span></div><Link href="/">返回首页</Link></header>
        <div className={`conversation ${messages.length ? "has-messages" : ""}`}>
          {messages.length === 0 ? <div className="welcome"><div className="spark">✦</div><h1>今天想创造什么？</h1><p>对话、写作、绘图和视频生成，都可以从一句话开始。</p><div className="starters">{starters.map((item) => <button key={item} onClick={() => setPrompt(item)}>{item}<span>↗</span></button>)}</div></div> : <div className="message-list">{messages.map((message, index) => <article className={`message ${message.role}`} key={`${message.role}-${index}`}><div className="message-avatar">{message.role === "assistant" ? "✦" : "你"}</div><div><p>{message.content}</p>{message.imageUrl && <a href={message.imageUrl} target="_blank" rel="noreferrer"><Image src={message.imageUrl} alt="AI 生成作品" width={1024} height={1024} unoptimized/></a>}{message.videoUrl && <video src={message.videoUrl} controls playsInline/>}</div></article>)}</div>}
        </div>

        <form className="composer" onSubmit={submit}>
          <div className="mode-tabs">{(["chat", "image", "video"] as Mode[]).map((item) => <button type="button" className={mode === item ? "active" : ""} key={item} onClick={() => setMode(item)}>{item === "chat" ? "✦ 对话" : item === "image" ? "▧ 图片" : "▷ 视频"}</button>)}</div>
          <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submit(); } }} placeholder={mode === "chat" ? "问影动任何问题…" : mode === "image" ? "描述你想生成的画面…" : "描述镜头、角色动作、场景和风格…"}/>
          {mode === "video" && <div className="video-options"><select value={duration} onChange={(e) => setDuration(e.target.value)}><option value="5">5 秒</option><option value="10">10 秒</option><option value="15">15 秒</option></select><select value={ratio} onChange={(e) => setRatio(e.target.value)}><option value="9:16">9:16 竖屏</option><option value="16:9">16:9 横屏</option><option value="1:1">1:1 方形</option></select><select value={resolution} onChange={(e) => setResolution(e.target.value)}><option value="480p">480p</option><option value="720p">720p</option></select></div>}
          <div className="composer-actions"><div><button type="button" className="attach" onClick={() => fileInput.current?.click()}>＋</button><input ref={fileInput} type="file" accept="image/*" hidden onChange={handleImage}/>{imageName && <span className="file-chip">▧ {imageName}<button type="button" onClick={() => { setImageData(""); setImageName(""); }}>×</button></span>}</div><button className="send" disabled={!prompt.trim() || loading} aria-label="发送">{loading ? "…" : "↑"}</button></div>
          {status && <p className="status">{status}</p>}
        </form>
        <p className="disclaimer">AI 生成内容可能存在错误，重要信息请自行核实。</p>
      </section>
    </main>
  );
}
