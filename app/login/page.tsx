"use client";

import { useState } from "react";
import { supabase } from "../lib/supabase";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function signUp() {
    const { error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      alert(error.message);
    } else {
      alert("注册成功，请检查邮箱！");
    }
  }

  async function signIn() {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      alert(error.message);
    } else {
      alert("登录成功！");
    }
  }

  return (
    <div style={{maxWidth:400,margin:"80px auto"}}>
      <h1>影动AI 登录</h1>

      <input
        placeholder="邮箱"
        value={email}
        onChange={(e)=>setEmail(e.target.value)}
        style={{width:"100%",padding:10,marginBottom:10}}
      />

      <input
        type="password"
        placeholder="密码"
        value={password}
        onChange={(e)=>setPassword(e.target.value)}
        style={{width:"100%",padding:10,marginBottom:10}}
      />

      <button onClick={signIn} style={{width:"100%",padding:10}}>
        登录
      </button>

      <br /><br />

      <button onClick={signUp} style={{width:"100%",padding:10}}>
        注册
      </button>
    </div>
  );
}