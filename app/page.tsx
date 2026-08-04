"use client";

import { ChangeEvent, useState } from "react";

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [duration, setDuration] = useState("5");
  const [ratio, setRatio] = useState("9:16");
  const [resolution, setResolution] = useState("480p");
  const [model, setModel] = useState("xai-video");
  const [message, setMessage] = useState("");
const [imagePreview, setImagePreview] = useState("");
const [videoUrl, setVideoUrl] = useState("");
const [isGenerating, setIsGenerating] = useState(false);
 function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
  const file = event.target.files?.[0];

  if (!file) {
    return;
  }

  if (!file.type.startsWith("image/")) {
    setMessage("请选择图片文件");
    return;
  }

  if (file.size > 5 * 1024 * 1024) {
    setMessage("图片不能超过 5MB");
    return;
  }

  const previewUrl = URL.createObjectURL(file);
  setImagePreview(previewUrl);
  setMessage("");
} async function handleGenerate() {
  if (!prompt.trim()) {
    setMessage("请先输入视频提示词");
    return;
  }

  try {
    setIsGenerating(true);
    setVideoUrl("");
    setMessage("正在提交视频生成任务……");

    const generateResponse = await fetch("/api/generate", { 
           method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
    provider: model,
    prompt,
    duration,
    aspectRatio: ratio,
    resolution,
})
    });

    const generateData = await generateResponse.json();

    if (!generateResponse.ok) {
      throw new Error(generateData.error || "提交生成任务失败");
    }

    const requestId = generateData.requestId;

    if (!requestId) {
      throw new Error("没有收到 requestId");
    }

    setMessage("任务已提交，AI 正在生成视频……");

    for (let attempt = 0; attempt < 120; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 5000));

      const statusResponse = await fetch(
        `/api/status?requestId=${encodeURIComponent(requestId)}`,
        { cache: "no-store" }
      );

      const statusData = await statusResponse.json();

      if (!statusResponse.ok) {
        throw new Error(statusData.error || "查询生成状态失败");
      }

      if (statusData.status === "done") {
        if (!statusData.videoUrl) {
          throw new Error("任务完成，但没有返回视频地址");
        }

        setVideoUrl(statusData.videoUrl);
        setMessage("视频生成完成！");
        return;
      }

      if (
        statusData.status === "failed" ||
        statusData.status === "expired"
      ) {
        throw new Error(`视频生成失败：${statusData.status}`);
      }

      setMessage(`AI 正在生成视频，当前状态：${statusData.status}`);
    }

    throw new Error("生成等待超时，请稍后重试");
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "生成视频时发生未知错误";

    setMessage(errorMessage);
  } finally {
    setIsGenerating(false);
  }
}

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-white/10 bg-slate-900">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <div>
            <h1 className="text-2xl font-bold">影动 AI</h1>
            <p className="text-sm text-slate-400">AI 漫剧视频生成平台</p>
          </div>

          <div className="rounded-full bg-violet-600 px-4 py-2 text-sm font-semibold">
            余额：1000 积分
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-8 px-6 py-10 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-xl">
          <h2 className="mb-6 text-xl font-bold">创建 AI 视频</h2>

          <label className="mb-2 block text-sm text-slate-300">
            角色参考图
          </label>

          <label className="mb-6 flex min-h-40 cursor-pointer items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-slate-600 bg-slate-950 text-slate-400 hover:border-violet-500">
  {imagePreview ? (
    <img
      src={imagePreview}
      alt="角色参考图预览"
      className="max-h-72 w-full object-contain"
    />
  ) : (
    <div className="py-12 text-center">
      <div className="mb-2 text-3xl">🖼️</div>
      <p>点击上传图片</p>
      <p className="mt-1 text-xs text-slate-500">支持 JPG、PNG，最大 5MB</p>
    </div>
  )}

  <input
    type="file"
    accept="image/*"
    onChange={handleImageChange}
    className="hidden"
  />
</label>

          <label className="mb-2 block text-sm text-slate-300">
            视频提示词
          </label>

          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="例如：清晨的出租屋内，年轻男子缓慢站起，窗外城市繁华，国漫电影CG风格，镜头缓慢推进……"
            className="mb-6 h-36 w-full resize-none rounded-xl border border-slate-700 bg-slate-950 p-4 outline-none focus:border-violet-500"
          />

          <div className="mb-6 grid grid-cols-3 gap-3">
            <div>
              <label className="mb-2 block text-sm text-slate-300">
                时长
              </label>
              <select
                value={duration}
                onChange={(event) => setDuration(event.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3"
              >
                <option value="5">5秒</option>
                <option value="10">10秒</option>
                <option value="15">15秒</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm text-slate-300">
                比例
              </label>
              <select
                value={ratio}
                onChange={(event) => setRatio(event.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3"
              >
                <option value="9:16">9:16</option>
                <option value="16:9">16:9</option>
                <option value="1:1">1:1</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm text-slate-300">
                清晰度
              </label>
              <select
                value={resolution}
                onChange={(event) => setResolution(event.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3"
              >
                <option value="480p">480p</option>
                <option value="720p">720p</option>
              </select>
            </div>
          </div>

          <button
  onClick={handleGenerate}
  disabled={isGenerating}
  className="w-full rounded-xl bg-violet-600 py-4 font-bold hover:bg-violet-500 disabled:cursor-not-allowed disabled:bg-slate-700"
>
  {isGenerating ? "AI生成中，请稍候……" : "立即生成 · 50积分"}
</button>

          {message && (
            <div className="mt-4 rounded-lg bg-slate-800 p-4 text-sm text-slate-200">
              {message}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-xl">
          <h2 className="mb-6 text-xl font-bold">视频预览</h2>
<div className="flex min-h-[520px] items-center justify-center overflow-hidden rounded-2xl bg-black">
  {videoUrl ? (
    <video
      src={videoUrl}
      controls
      autoPlay
      playsInline
      className="max-h-[620px] w-full object-contain"
    >
      你的浏览器不支持视频播放。
    </video>
  ) : (
    <div className="text-center text-slate-500">
      <div className="mb-3 text-5xl">🎬</div>
      <p>
        {isGenerating
          ? "AI 正在生成视频……"
          : "生成的视频将在这里显示"}
      </p>

      <p className="mt-2 text-sm">
        {duration}秒 · {ratio} · {resolution}
      </p>
    </div>
  )}
</div>
</div> 
      </section>
    </main>
  );
}