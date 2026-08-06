import Link from "next/link";

const features = [
  { icon: "✦", title: "AI 对话", text: "策划、写作、分析和灵感探索，支持连续上下文。" },
  { icon: "▧", title: "图片生成", text: "一句话生成海报、角色设计和分镜概念图。" },
  { icon: "▷", title: "视频生成", text: "从文字或参考图生成适合漫剧和短视频的动态镜头。" },
];

export default function Home() {
  return (
    <main className="landing">
      <header className="landing-nav"><a className="wordmark" href="#top"><span>影</span><b>影动 AI</b></a><nav><a href="#features">能力</a><a href="#workflow">使用方式</a><Link href="/login">登录</Link><Link className="nav-cta" href="/dashboard">开始创作</Link></nav></header>
      <section className="landing-hero" id="top"><div className="hero-glow"/><p className="eyebrow">AI CREATIVE STUDIO</p><h1>把一个想法，<br/><em>变成一部作品。</em></h1><p className="hero-copy">影动 AI 将智能对话、图片与视频生成放进同一个创作空间。写剧本、设计角色、生成镜头，从一句话开始。</p><div className="hero-actions"><Link className="primary-cta" href="/dashboard">免费开始创作 <span>↗</span></Link><a className="text-link" href="#features">了解更多 ↓</a></div><div className="prompt-demo"><div className="demo-top"><span>✦ 影动 1.0</span><i>在线</i></div><p>“创作一部发生在未来重庆的三集悬疑漫剧，主角是一名失忆的仿生人侦探。”</p><div><span>✦ 正在构思故事结构、角色设定与视觉风格…</span><b>↑</b></div></div></section>
      <section className="feature-section" id="features"><div className="section-kicker">一个工作台，完整创作链路</div><div className="feature-grid">{features.map((feature, index) => <article key={feature.title}><span>{feature.icon}</span><small>0{index + 1}</small><h2>{feature.title}</h2><p>{feature.text}</p></article>)}</div></section>
      <section className="workflow" id="workflow"><div><p className="eyebrow">FROM IDEA TO MOTION</p><h2>创作不再需要<br/>切换十个工具。</h2></div><ol><li><b>01</b><div><h3>说出想法</h3><p>用自然语言描述故事、画面或问题。</p></div></li><li><b>02</b><div><h3>持续打磨</h3><p>与 AI 对话，调整剧本、角色和镜头。</p></div></li><li><b>03</b><div><h3>生成作品</h3><p>直接输出图片或视频，随时打开和下载。</p></div></li></ol></section>
      <section className="final-cta"><span>✦</span><h2>你的下一部作品，<br/>从这里开始。</h2><Link href="/dashboard">进入影动 AI <b>↗</b></Link></section>
      <footer><a className="wordmark" href="#top"><span>影</span><b>影动 AI</b></a><p>AI 漫剧与视觉创作平台</p><small>© 2026 影动 AI</small></footer>
    </main>
  );
}
