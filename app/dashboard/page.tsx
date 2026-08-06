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
const manjuSteps: Array<{ step: string; title: string; detail: string; status: "available" | "next" | "planned"; mode: Mode; prompt: string }> = [
  { step: "01", title: "创建角色库", detail: "保存正面、左右45°和全身参考图，建立角色 V1", status: "next", mode: "image", prompt: "为【角色名】创建统一角色设定图：正面、左45度、右45度、全身，固定脸型、五官、发型、服装与配色，国漫电影感，纯色背景，专业动画设定稿。" },
  { step: "02", title: "写小说 / 剧情", detail: "确定世界观、人物关系和连续多集剧情", status: "available", mode: "chat", prompt: "你是一名爆款漫剧策划。请围绕【题材/一句话创意】设计20集竖屏漫剧，输出世界观、角色关系、主线冲突和每集钩子。每集60—90秒，保持设定连续。" },
  { step: "03", title: "AI 一键拆分镜", detail: "自动生成镜头、时长、景别、运镜、音效和提示词", status: "next", mode: "chat", prompt: "把上面的章节自动拆成10—15个分镜。用表格输出：镜号、时长、景别、机位、运镜、构图、角色动作、台词、音效、图片提示词、视频提示词。" },
  { step: "04", title: "自动提示词", detail: "用户只选近景、推进等选项，系统补全专业提示词", status: "available", mode: "chat", prompt: "把【镜头内容】改写成专业漫剧生成提示词。自动补充景别、机位、构图、运镜、光线、角色动作、情绪、环境和负面限制，同时输出中文与英文版本。" },
  { step: "05", title: "保持人物一致", detail: "每个镜头自动绑定角色版本、固定脸型与服装", status: "next", mode: "image", prompt: "Use 【角色名】 Character V1. Same face, same hairstyle, same clothes, same identity. 竖屏漫剧画面，场景：【场景】，动作：【动作】，景别：【景别】，9:16，无文字，无水印。" },
  { step: "06", title: "批量生成图片", detail: "根据分镜连续生成整集画面", status: "next", mode: "image", prompt: "根据分镜清单依次生成9:16国漫画面。严格复用角色设定，保持脸型、发型、服装、场景色调和光线连续。当前镜头：【粘贴分镜】" },
  { step: "07", title: "批量图片转视频", detail: "每张分镜图自动生成对应动态镜头", status: "next", mode: "video", prompt: "保持参考图角色、服装和场景完全一致。人物【动作】，镜头【运镜】，自然眨眼、呼吸和发丝摆动，动作稳定，5秒，无变形。" },
  { step: "08", title: "自动配音与字幕", detail: "固定角色声线，多语言配音并自动生成时间轴字幕", status: "planned", mode: "chat", prompt: "" },
  { step: "09", title: "AI 自动剪辑", detail: "自动转场、音乐、音效、字幕并输出整集 MP4", status: "planned", mode: "video", prompt: "" },
  { step: "10", title: "角色与模板市场", detail: "购买角色 V1 和末日、修仙、霸总等20集模板", status: "planned", mode: "chat", prompt: "" },
];

export default function Dashboard() {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>("chat");
  const [panel, setPanel] = useState<"create" | "workflow" | "works">("workflow");
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
  function applyManjuTemplate(template: (typeof manjuSteps)[number]) { if (!template.prompt) return; setMode(template.mode); setPrompt(template.prompt); setPanel("create"); setStatus(`${template.title}模板已放入输入框，可替换【】中的内容后发送`); }

  return <main className="ai-shell">
    <aside className="sidebar">
      <Link className="wordmark" href="/"><span>影</span><b>影动 AI</b></Link>
      <button className="new-chat" onClick={newConversation}>＋ 新建创作</button>
      <nav className="side-nav"><button className={panel === "workflow" ? "active" : ""} onClick={() => setPanel("workflow")}>▦ 漫剧工作流</button><button className={panel === "create" ? "active" : ""} onClick={() => setPanel("create")}>✦ 当前创作</button><button className={panel === "works" ? "active" : ""} onClick={() => setPanel("works")}>▧ 我的作品</button><Link href="/admin">⌁ 运营后台</Link></nav>
      <div className="recent"><p>历史会话</p>{conversations.length ? conversations.slice(0, 8).map((item) => <button key={item.id} onClick={() => openConversation(item.id)} title={item.title}>{item.title}</button>) : <span>还没有历史记录</span>}</div>
      <div className="account"><div className="avatar">{email.slice(0, 1).toUpperCase() || "Y"}</div><div><b>{email.split("@")[0] || "创作者"}</b><small>{credits} 积分</small></div><button onClick={signOut} title="退出登录">↗</button></div>
    </aside>
    <section className="studio">
      <header className="studio-head"><div><b>影动漫剧 1.2</b><span>{panel === "workflow" ? "从创意到成片" : panel === "works" ? "作品库" : `${mode === "chat" ? "编剧" : mode === "image" ? "画面" : "镜头"}模式`}</span></div><Link href="/">返回首页</Link></header>
      {panel === "workflow" ? <div className="manju-view"><div className="manju-hero"><div><p className="eyebrow">AI COMIC DRAMA PIPELINE</p><h1>一键生成，<br/>整集漫剧。</h1><p>创建角色 → 写小说 → AI拆分镜 → 自动提示词 → 批量图片 → 批量视频 → 配音字幕 → 自动剪辑 → 导出 MP4。</p></div><button onClick={() => applyManjuTemplate(manjuSteps[1])}>创建第一部漫剧 <span>↗</span></button></div><div className="pipeline-priorities"><b>下一步优先开发</b><span>① 角色库</span><span>② 小说一键拆分镜</span><span>③ 批量图片转视频</span></div><div className="manju-steps">{manjuSteps.map((item) => <article className={`stage-${item.status}`} key={item.step}><div className="step-no">{item.step}</div><div><h2>{item.title}</h2><p>{item.detail}</p><span>{item.status === "available" ? "现在可用" : item.status === "next" ? "下一阶段" : "规划中"}</span></div><button disabled={!item.prompt} onClick={() => applyManjuTemplate(item)}>{item.prompt ? "使用模板 ↗" : "即将推出"}</button></article>)}</div><div className="continuity-tip"><b>核心目标：整集自动化</b><p>角色只创建一次，后续镜头自动绑定角色版本；小说自动拆分镜并批量生成图片、视频、配音、字幕，最终一键导出完整 MP4。</p></div></div> : panel === "works" ? <div className="works-view"><div className="works-heading"><p className="eyebrow">CREATIVE LIBRARY</p><h1>我的作品</h1><span>图片和视频生成完成后会自动保存在这里。</span></div><div className="works-grid">{works.map((work) => <article className="work-card" key={work.id}>{work.url && work.type === "image" ? <Image src={work.url} alt={work.prompt} width={600} height={600} unoptimized/> : work.url ? <video src={work.url} controls playsInline/> : <div className="work-processing">{work.status === "failed" ? "生成失败" : "正在生成…"}</div>}<div><b>{work.type === "image" ? "图片" : "视频"}</b><p>{work.prompt}</p></div></article>)}</div>{!works.length && <div className="admin-notice">还没有作品，先去生成一张图片或一段视频吧。</div>}</div> : <>
        <div className={`conversation ${messages.length ? "has-messages" : ""}`}>{messages.length === 0 ? <div className="welcome"><div className="spark">✦</div><h1>今天想创造什么？</h1><p>对话、写作、绘图和视频生成，都可以从一句话开始。</p><div className="starters">{starters.map((item) => <button key={item} onClick={() => setPrompt(item)}>{item}<span>↗</span></button>)}</div></div> : <div className="message-list">{messages.map((message, index) => <article className={`message ${message.role}`} key={`${message.role}-${index}`}><div className="message-avatar">{message.role === "assistant" ? "✦" : "你"}</div><div><p>{message.content}</p>{message.imageUrl && <a href={message.imageUrl} target="_blank" rel="noreferrer"><Image src={message.imageUrl} alt="AI 生成作品" width={1024} height={1024} unoptimized/></a>}{message.videoUrl && <video src={message.videoUrl} controls playsInline/>}</div></article>)}</div>}</div>
        <form className="composer" onSubmit={submit}><div className="mode-tabs">{(["chat", "image", "video"] as Mode[]).map((item) => <button type="button" className={mode === item ? "active" : ""} key={item} onClick={() => setMode(item)}>{item === "chat" ? "✦ 对话" : item === "image" ? "▧ 图片" : "▷ 视频"}</button>)}</div><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submit(); } }} placeholder={mode === "chat" ? "问影动任何问题…" : mode === "image" ? "描述你想生成的画面…" : "描述镜头、角色动作、场景和风格…"}/>{mode === "video" && <div className="video-options"><select value={duration} onChange={(e) => setDuration(e.target.value)}><option value="5">5 秒</option><option value="10">10 秒</option><option value="15">15 秒</option></select><select value={ratio} onChange={(e) => setRatio(e.target.value)}><option value="9:16">9:16 竖屏</option><option value="16:9">16:9 横屏</option><option value="1:1">1:1 方形</option></select><select value={resolution} onChange={(e) => setResolution(e.target.value)}><option value="480p">480p</option><option value="720p">720p</option></select></div>}<div className="composer-actions"><div><button type="button" className="attach" onClick={() => fileInput.current?.click()}>＋</button><input ref={fileInput} type="file" accept="image/*" hidden onChange={handleImage}/>{imageName && <span className="file-chip">▧ {imageName}<button type="button" onClick={() => { setImageData(""); setImageName(""); }}>×</button></span>}</div><button className="send" disabled={!prompt.trim() || loading} aria-label="发送">{loading ? "…" : "↑"}</button></div>{status && <p className="status">{status}</p>}</form><p className="disclaimer">AI 生成内容可能存在错误，重要信息请自行核实。</p>
      </>}
    </section>
  </main>;
}
