import Link from "next/link";

const features = [
  { icon: "文", title: "AI 编剧", text: "从一句话创意生成世界观、角色圣经、分集大纲和60—90秒竖屏剧本。" },
  { icon: "画", title: "角色与分镜", text: "生成角色定妆、连续分镜和9:16国漫画面，让人物造型贯穿每一集。" },
  { icon: "动", title: "动态镜头", text: "上传分镜图生成动作稳定的视频镜头，逐镜组合成完整漫剧。" },
];

export default function Home() {
  return <main className="landing">
    <header className="landing-nav"><a className="wordmark" href="#top"><span>影</span><b>影动 AI</b></a><nav><a href="#features">漫剧能力</a><a href="#workflow">制作流程</a><Link href="/login">登录</Link><Link className="nav-cta" href="/dashboard">开始做漫剧</Link></nav></header>
    <section className="landing-hero" id="top"><div className="hero-glow"/><p className="eyebrow">AI COMIC DRAMA STUDIO</p><h1>一个创意，<br/><em>拍成一部漫剧。</em></h1><p className="hero-copy">影动 AI 把故事策划、角色设定、分集剧本、分镜出图和动态镜头放进同一个制作流程。不会画画、不会剪辑，也能从一句话开始。</p><div className="hero-actions"><Link className="primary-cta" href="/dashboard">免费开始做漫剧 <span>↗</span></Link><a className="text-link" href="#workflow">查看制作流程 ↓</a></div><div className="prompt-demo"><div className="demo-top"><span>▦ 漫剧工作流</span><i>7 个步骤</i></div><p>“做一部发生在未来重庆的悬疑漫剧，主角是一名失忆的仿生人侦探，每集结尾都有反转。”</p><div><span>✦ 正在生成故事钩子、角色圣经与前三集结构…</span><b>↗</b></div></div></section>
    <section className="feature-section" id="features"><div className="section-kicker">专为竖屏漫剧设计的 AI 制作台</div><div className="feature-grid">{features.map((feature, index) => <article key={feature.title}><span>{feature.icon}</span><small>0{index + 1}</small><h2>{feature.title}</h2><p>{feature.text}</p></article>)}</div></section>
    <section className="workflow" id="workflow"><div><p className="eyebrow">FROM STORY TO MOTION</p><h2>七步完成<br/>第一集漫剧。</h2></div><ol><li><b>01</b><div><h3>故事与角色</h3><p>确定爆点、受众、世界观和固定角色形象。</p></div></li><li><b>02</b><div><h3>剧本与分镜</h3><p>写出分集剧本，并拆成可直接生成的镜头清单。</p></div></li><li><b>03</b><div><h3>画面与视频</h3><p>生成统一风格的分镜图，再让每个镜头动起来。</p></div></li></ol></section>
    <section className="final-cta"><span>第 1 集</span><h2>你的漫剧宇宙，<br/>今天开拍。</h2><Link href="/dashboard">进入漫剧工作台 <b>↗</b></Link></section>
    <footer><a className="wordmark" href="#top"><span>影</span><b>影动 AI</b></a><p>AI 漫剧策划、分镜与视频制作平台</p><small>© 2026 影动 AI</small></footer>
  </main>;
}
