"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function signIn(event: FormEvent) {
    event.preventDefault(); setLoading(true); setMessage("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return setMessage(error.message);
    router.push("/dashboard"); router.refresh();
  }

  return <main className="auth-page"><form className="auth-card" onSubmit={signIn}><Link className="wordmark" href="/"><span>影</span><b>影动 AI</b></Link><h1>欢迎回来</h1><p>登录后继续你的 AI 创作。</p>{message && <div className="auth-message">{message}</div>}<label htmlFor="email">邮箱</label><input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com"/><label htmlFor="password">密码</label><input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="输入密码"/><button className="auth-submit" disabled={loading}>{loading ? "正在登录…" : "登录"}</button><p className="auth-switch">还没有账号？ <Link href="/register">免费注册</Link></p></form></main>;
}
