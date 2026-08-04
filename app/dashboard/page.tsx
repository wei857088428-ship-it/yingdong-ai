"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
export default function Dashboard() {
  const [prompt, setPrompt] = useState("");
  const [email, setEmail] = useState("");
const [credits, setCredits] = useState(0);
  const [duration, setDuration] = useState("5");
  const [ratio, setRatio] = useState("9:16");
  const [model, setModel] = useState("xai");

  useEffect(() => {
  async function loadUser() {
    const { data } = await supabase.auth.getUser();

    if (!data.user) return;

    setEmail(data.user.email || "");

    const { data: profile } = await supabase
      .from("profiles")
      .select("credits")
      .eq("id", data.user.id)
      .single();

    if (profile) {
      setCredits(profile.credits);
    }
  }

  loadUser();
}, []);

  function handleGenerate() {
    if (!prompt.trim()) {
      alert("请先输入视频提示词");
      return;
    }

    alert("下一步接入真实视频生成和积分扣除");
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "30px",
        color: "#ffffff",
        background:
          "radial-gradient(circle at top left, #172554 0%, #0f172a 42%, #020617 100%)",
      }}
    >
      <div
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
        }}
      >
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "28px",
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: "32px" }}>🎬 影动AI</h1>
            <p style={{ color: "#94a3b8", marginTop: "8px" }}>
              AI 漫剧与视频生成控制台
            </p>
          </div>

          <div
            style={{
              padding: "12px 18px",
              borderRadius: "14px",
              background: "rgba(15, 23, 42, 0.8)",
              border: "1px solid rgba(148, 163, 184, 0.25)",
            }}
          >
            💎 当前积分：100
          </div>
        </header>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.1fr) minmax(320px, 0.9fr)",
            gap: "24px",
          }}
        >
          <div
            style={{
              padding: "24px",
              borderRadius: "22px",
              background: "rgba(15, 23, 42, 0.82)",
              border: "1px solid rgba(148, 163, 184, 0.2)",
              boxShadow: "0 20px 60px rgba(0, 0, 0, 0.28)",
            }}
          >
            <h2 style={{ marginTop: 0 }}>创作设置</h2>

            <label
              style={{
                display: "block",
                marginBottom: "10px",
                color: "#cbd5e1",
              }}
            >
              视频提示词
            </label>

            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="例如：末日城市暴雨中，年轻男子站在便利店门口，国漫电影CG风格，镜头缓慢推进……"
              style={{
                width: "100%",
                minHeight: "190px",
                padding: "16px",
                resize: "vertical",
                borderRadius: "14px",
                border: "1px solid #334155",
                background: "#020617",
                color: "#ffffff",
                fontSize: "16px",
                boxSizing: "border-box",
                outline: "none",
              }}
            />

            <div
              style={{
                marginTop: "20px",
                padding: "22px",
                textAlign: "center",
                borderRadius: "16px",
                border: "2px dashed #7c3aed",
                background: "rgba(124, 58, 237, 0.08)",
              }}
            >
              <div style={{ fontSize: "36px", marginBottom: "8px" }}>🖼️</div>
              <p style={{ margin: "6px 0" }}>点击上传角色参考图</p>
              <p style={{ margin: 0, color: "#94a3b8", fontSize: "13px" }}>
                支持 JPG、PNG，最大 5MB
              </p>

              <input
                type="file"
                accept="image/*"
                style={{ marginTop: "14px" }}
              />
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                gap: "14px",
                marginTop: "22px",
              }}
            >
              <div>
                <label style={{ display: "block", marginBottom: "8px" }}>
                  模型
                </label>
                <select
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                  style={selectStyle}
                >
                  <option value="xai">xAI Grok</option>
<option value="kling">Kling 3.0</option>
<option value="veo">Google Veo</option>
<option value="runway">Runway</option>
                </select>
              </div>

              <div>
                <label style={{ display: "block", marginBottom: "8px" }}>
                  时长
                </label>
                <select
                  value={duration}
                  onChange={(event) => setDuration(event.target.value)}
                  style={selectStyle}
                >
                  <option value="5">5秒</option>
                  <option value="10">10秒</option>
                  <option value="15">15秒</option>
                </select>
              </div>

              <div>
                <label style={{ display: "block", marginBottom: "8px" }}>
                  比例
                </label>
                <select
                  value={ratio}
                  onChange={(event) => setRatio(event.target.value)}
                  style={selectStyle}
                >
                  <option value="9:16">9:16 竖屏</option>
                  <option value="16:9">16:9 横屏</option>
                  <option value="1:1">1:1 方形</option>
                </select>
              </div>
            </div>

            <button
              onClick={handleGenerate}
              style={{
                width: "100%",
                marginTop: "24px",
                padding: "16px",
                border: "none",
                borderRadius: "14px",
                color: "#ffffff",
                fontSize: "17px",
                fontWeight: 700,
                cursor: "pointer",
                background:
                  "linear-gradient(90deg, #7c3aed 0%, #a855f7 52%, #ec4899 100%)",
                boxShadow: "0 10px 30px rgba(168, 85, 247, 0.35)",
              }}
            >
              立即生成 · 50积分
            </button>
          </div>

          <div
            style={{
              padding: "24px",
              borderRadius: "22px",
              background: "rgba(15, 23, 42, 0.82)",
              border: "1px solid rgba(148, 163, 184, 0.2)",
              boxShadow: "0 20px 60px rgba(0, 0, 0, 0.28)",
            }}
          >
            <h2 style={{ marginTop: 0 }}>视频预览</h2>

            <div
              style={{
                minHeight: "520px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center",
                borderRadius: "18px",
                background: "#020617",
                border: "1px solid #1e293b",
                color: "#64748b",
              }}
            >
              <div>
                <div style={{ fontSize: "48px", marginBottom: "12px" }}>🎞️</div>
                <p>生成的视频将在这里显示</p>
                <p style={{ fontSize: "14px" }}>
                  {duration}秒 · {ratio} · {model}
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

const selectStyle = {
  width: "100%",
  padding: "12px",
  borderRadius: "12px",
  border: "1px solid #334155",
  background: "#020617",
  color: "#ffffff",
  fontSize: "15px",
};