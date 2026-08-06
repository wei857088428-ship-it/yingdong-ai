"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Overview = { xai: { configured: boolean; prepaidBalance: number | null; monthSpend: number | null; spendingLimit: number | null; error: string | null }; site: { users: number; totalCredits: number; requestsToday: number; creditsToday: number; worksToday: number }; updatedAt: string };

export default function AdminPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  async function load() {
    setLoading(true); setError("");
    try { const response = await fetch("/api/admin/overview", { cache: "no-store" }); const result = await response.json(); if (!response.ok) throw new Error(result.error || "无法加载运营数据"); setData(result); }
    catch (problem) { setError(problem instanceof Error ? problem.message : "无法加载运营数据"); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    fetch("/api/admin/overview", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "无法加载运营数据");
        setData(result);
      })
      .catch((problem) => setError(problem instanceof Error ? problem.message : "无法加载运营数据"))
      .finally(() => setLoading(false));
  }, []);
  const money = (value: number | null) => value === null ? "—" : `$${value.toFixed(2)}`;
  return <main className="admin-page"><header className="admin-head"><Link className="wordmark" href="/"><span>影</span><b>影动 AI</b></Link><div><Link href="/dashboard">返回创作台</Link><button onClick={load}>刷新数据</button></div></header><section className="admin-content"><div className="admin-title"><div><p className="eyebrow">OPERATIONS CENTER</p><h1>运营后台</h1><span>查看 API 成本、用户和站内积分。</span></div>{data && <small>更新于 {new Date(data.updatedAt).toLocaleString("zh-CN")}</small>}</div>{loading ? <div className="admin-notice">正在读取运营数据…</div> : error ? <div className="admin-notice error"><b>无法访问后台</b><p>{error}</p><small>请确认当前登录邮箱已添加到 ADMIN_EMAILS。</small></div> : data && <><div className="metric-grid"><Metric label="xAI 预付余额" value={money(data.xai.prepaidBalance)} detail={data.xai.configured ? "实时读取" : "等待配置"}/><Metric label="本月 API 消费" value={money(data.xai.monthSpend)} detail="xAI 当前账期"/><Metric label="月结消费上限" value={money(data.xai.spendingLimit)} detail="超出后停止调用"/><Metric label="注册用户" value={String(data.site.users)} detail="Supabase profiles"/><Metric label="站内剩余积分" value={data.site.totalCredits.toLocaleString()} detail="所有用户合计"/><Metric label="今日 API 请求" value={String(data.site.requestsToday)} detail={`消耗 ${data.site.creditsToday} 积分`}/><Metric label="今日生成作品" value={String(data.site.worksToday)} detail="图片与视频"/></div>{!data.xai.configured && <div className="setup-card"><b>完成 xAI 余额连接</b><p>在 Vercel 环境变量中加入以下密钥并重新部署：</p><code>XAI_MANAGEMENT_API_KEY</code><code>XAI_TEAM_ID</code><p>密钥只保存在服务器端，不会发送到浏览器。</p></div>}{data.xai.error && <div className="admin-notice error">{data.xai.error}</div>}</>}</section></main>;
}
function Metric({ label, value, detail }: { label: string; value: string; detail: string }) { return <article className="metric-card"><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>; }
