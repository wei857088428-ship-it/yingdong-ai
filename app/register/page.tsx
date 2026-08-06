"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { supabase } from "../lib/supabase";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function register(event: FormEvent) {
    event.preventDefault(); setLoading(true); setMessage("");
    const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/login` } });
    setLoading(false);
    setMessage(error ? error.message : "注册成功，请检查邮箱并点击确认链接。");
  }

  return <main className="auth-page"><form className="auth-card" onSubmit={register}><Link className="wordmark" href="/"><span>影</span><b>影动 AI</b></Link><h1>开始创作</h1><p>注册即获新用户创作积分。</p>{message && <div className="auth-message">{message}</div>}<label htmlFor="email">邮箱</label><input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com"/><label htmlFor="password">密码</label><input id="password" type="password" autoComplete="new-password" minLength={6} required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="至少 6 位密码"/><button className="auth-submit" disabled={loading}>{loading ? "正在创建账号…" : "免费注册"}</button><p className="auth-switch">已有账号？ <Link href="/login">直接登录</Link></p></form></main>;
}
