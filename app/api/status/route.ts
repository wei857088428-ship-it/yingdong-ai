import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const apiKey = process.env.XAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "服务器没有配置 XAI_API_KEY" },
        { status: 500 }
      );
    }

    const requestId = request.nextUrl.searchParams.get("requestId");

    if (!requestId) {
      return NextResponse.json(
        { error: "缺少 requestId" },
        { status: 400 }
      );
    }

    const response = await fetch(
      `https://api.x.ai/v1/videos/${encodeURIComponent(requestId)}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        cache: "no-store",
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        {
          error:
            data?.error?.message ||
            data?.message ||
            "查询视频状态失败",
          details: data,
        },
        { status: response.status }
      );
    }

    return NextResponse.json({
      status: data.status,
      videoUrl: data.video?.url ?? null,
      video: data.video ?? null,
    });
  } catch (error) {
    console.error("Status API error:", error);

    return NextResponse.json(
      { error: "服务器发生错误，请稍后重试" },
      { status: 500 }
    );
  }
}