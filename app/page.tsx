import Link from "next/link";

const features = [
  { icon: "人", title: "角色库", text: "保存角色正面、左右45°和全身参考图，后续镜头自动绑定同一个角色版本。" },
  { icon: "镜", title: "小说一键拆分镜", text: "自动生成镜头、时长、景别、运镜、音效，以及图片和视频提示词。" },
  { icon: "集", title: "批量生成整集", text: "按分镜批量生成图片和动态镜头，未来自动完成配音、字幕、剪辑与MP4导出。" },
];

export default function Home() {
  return <main className="landing">
    <header className="landing-nav"><a className="wordmark" href="#top"><span>影</span><b>影动 AI</b></a><nav><a href="#features">漫剧能力</a><a href="#workflow">制作流程</a><Link href="/login">登录</Link><Link className="nav-cta" href="/dashboard">开始做漫剧</Link></nav></header>
    <section className="landing-hero" id="top"><div className="hero-glow"/><p className="eyebrow">AI COMIC DRAMA STUDIO</p><h1>一个故事，<br/><em>自动生成整集漫剧。</em></h1><p className="hero-copy">角色只创建一次，AI 自动拆分镜、补全提示词、生成图片和动态镜头。目标是完成配音、字幕、剪辑后，一键导出整集 MP4。</p><div className="hero-actions"><Link className="primary-cta" href="/dashboard">进入漫剧生产线 <span>↗</span></Link><a className="text-link" href="#workflow">查看完整路线 ↓</a></div><div className="prompt-demo"><div className="demo-top"><span>▦ 漫剧生产线</span><i>10 个阶段</i></div><p>创建角色 → 写小说 → AI拆分镜 → 自动提示词 → 批量图片 → 批量视频 → 配音字幕 → 自动剪辑</p><div><span>✦ 角色林川 V1 已绑定到本集全部镜头</span><b>↗</b></div></div></section>
    <section className="feature-section" id="features"><div className="section-kicker">专为竖屏漫剧设计的 AI 制作台</div><div className="feature-grid">{features.map((feature, index) => <article key={feature.title}><span>{feature.icon}</span><small>0{index + 1}</small><h2>{feature.title}</h2><p>{feature.text}</p></article>)}</div></section>
    <section className="workflow" id="workflow"><div><p className="eyebrow">FROM STORY TO MOTION</p><h2>七步完成<br/>第一集漫剧。</h2></div><ol><li><b>01</b><div><h3>故事与角色</h3><p>确定爆点、受众、世界观和固定角色形象。</p></div></li><li><b>02</b><div><h3>剧本与分镜</h3><p>写出分集剧本，并拆成可直接生成的镜头清单。</p></div></li><li><b>03</b><div><h3>画面与视频</h3><p>生成统一风格的分镜图，再让每个镜头动起来。</p></div></li></ol></section>
    <section className="final-cta"><span>第 1 集</span><h2>你的漫剧宇宙，<br/>今天开拍。</h2><Link href="/dashboard">进入漫剧工作台 <b>↗</b></Link></section>
    <footer><a className="wordmark" href="#top"><span>影</span><b>影动 AI</b></a><p>AI 漫剧策划、分镜与视频制作平台</p><small>© 2026 影动 AI</small></footer>
  </main>;
}
