import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/app/lib/auth";

type Provider = "xai" | "kling";

type JsonObject = {
  error?: { message?: string };
  message?: string;
  status?: string;
  progress?: number;
  video?: { url?: string };
  video_url?: string;
  url?: string;
  output?: { video_url?: string };
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    // 1. 验证登录
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { error: "请先登录后再查询视频状态" },
        { status: 401 }
      );
    }

    // 2. 获取参数
    const providerParam =
      request.nextUrl.searchParams.get("provider") ?? "xai";

    const provider: Provider =
      providerParam === "kling" ? "kling" : "xai";

    const requestId =
      request.nextUrl.searchParams.get("requestId") ||
      request.nextUrl.searchParams.get("taskId");

    if (!requestId) {
      return NextResponse.json(
        { error: "缺少视频任务 ID" },
        { status: 400 }
      );
    }

    // 3. 根据平台查询
    if (provider === "kling") {
      return await getKlingVideoStatus(requestId);
    }

    return await getXaiVideoStatus(requestId);
  } catch (error) {
    console.error("Status API error:", error);

    return NextResponse.json(
      { error: "查询视频状态时发生错误，请稍后重试" },
      { status: 500 }
    );
  }
}

async function getXaiVideoStatus(requestId: string) {
  const apiKey = process.env.XAI_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "AI 视频服务尚未配置" },
      { status: 500 }
    );
  }

  const response = await fetch(
    `https://api.x.ai/v1/videos/${encodeURIComponent(requestId)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      cache: "no-store",
    }
  );

  const data = (await response.json()) as JsonObject;

  if (!response.ok) {
    console.error("xAI status query failed:", data);

    return NextResponse.json(
      {
        error:
          data?.error?.message ||
          data?.message ||
          "查询 xAI 视频状态失败",
        details: data,
      },
      { status: response.status }
    );
  }

  const status = String(data?.status ?? "processing").toLowerCase();

  const videoUrl =
    data?.video?.url ||
    data?.video_url ||
    data?.url ||
    data?.output?.video_url ||
    null;

  return NextResponse.json({
    provider: "xai",
    requestId,
    taskId: requestId,
    status,
    progress: data?.progress ?? null,
    videoUrl,
    video: data?.video ?? null,
    raw: data,
  });
}

async function getKlingVideoStatus(taskId: string) {
  return NextResponse.json(
    {
      provider: "kling",
      taskId,
      status: "unsupported",
      error: "Kling 状态查询接口尚未接通，请先使用 xAI 视频。",
    },
    { status: 501 }
  );
}
