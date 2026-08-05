import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/app/lib/auth";

type Provider = "xai" | "kling";

type GenerateBody = {
  provider?: Provider;
  prompt?: string;
  image?: string;
  duration?: number;
  aspectRatio?: string;
  resolution?: string;
};

type JsonObject = Record<string, any>;

export async function POST(request: NextRequest) {
  try {
    // ========= 登录验证 =========
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        {
          error: "请先登录后再生成视频",
        },
        {
          status: 401,
        }
      );
    }

    // ========= 读取参数 =========
    const body = (await request.json()) as GenerateBody;

    const provider: Provider =
      body.provider === "kling" ? "kling" : "xai";

    const prompt = body.prompt?.trim();
    const duration = Number(body.duration ?? 5);
    const aspectRatio = body.aspectRatio ?? "9:16";
    const resolution = body.resolution ?? "480p";

    if (!prompt) {
      return NextResponse.json(
        {
          error: "请输入视频提示词",
        },
        {
          status: 400,
        }
      );
    }

    if (
      !Number.isInteger(duration) ||
      duration < 1 ||
      duration > 15
    ) {
      return NextResponse.json(
        {
          error: "视频时长必须为1-15秒",
        },
        {
          status: 400,
        }
      );
    }

    if (provider === "kling") {
      return await createKlingVideo({
        prompt,
        duration,
        aspectRatio,
      });
    }

    return await createXaiVideo({
      prompt,
      image: body.image,
      duration,
      aspectRatio,
      resolution,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        error: "服务器错误",
      },
      {
        status: 500,
      }
    );
  }
}

/* ===========================================
                xAI
=========================================== */

async function createXaiVideo({
  prompt,
  image,
  duration,
  aspectRatio,
  resolution,
}: {
  prompt: string;
  image?: string;
  duration: number;
  aspectRatio: string;
  resolution: string;
}) {
  const apiKey = process.env.XAI_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      {
        error: "服务器没有配置 XAI_API_KEY",
      },
      {
        status: 500,
      }
    );
  }

  const requestBody: Record<string, unknown> = {
    model: "grok-imagine-video",
    prompt,
    duration,
    aspect_ratio: aspectRatio,
    resolution,
  };

  if (image) {
    requestBody.image = {
      url: image,
    };
  }

  const response = await fetch(
    "https://api.x.ai/v1/videos/generations",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
      cache: "no-store",
    }
  );

  const data = (await response.json()) as JsonObject;

  if (!response.ok) {
    return NextResponse.json(
      {
        error:
          data?.error?.message ??
          data?.message ??
          "xAI生成失败",
      },
      {
        status: response.status,
      }
    );
  }

  const requestId = data.request_id;

  return NextResponse.json({
    provider: "xai",
    requestId,
    taskId: requestId,
    status: "submitted",
  });
}

/* ===========================================
                Kling
=========================================== */

async function createKlingVideo({
  prompt,
  duration,
  aspectRatio,
}: {
  prompt: string;
  duration: number;
  aspectRatio: string;
}) {
  const apiKey = process.env.KLING_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      {
        error: "服务器没有配置 KLING_API_KEY",
      },
      {
        status: 500,
      }
    );
  }

  const response = await fetch(
    "https://api-beijing.klingai.com/text-to-video/kling-3.0-turbo",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt,
        options: {
          watermark_info: {
            enabled: false,
          },
        },
        settings: {
          duration,
          resolution: "720p",
          aspect_ratio: aspectRatio,
        },
      }),
      cache: "no-store",
    }
  );

  const data = (await response.json()) as JsonObject;

  if (!response.ok || data?.code !== 0) {
    return NextResponse.json(
      {
        error: data?.message ?? "Kling生成失败",
      },
      {
        status: response.ok ? 400 : response.status,
      }
    );
  }

  return NextResponse.json({
    provider: "kling",
    requestId: data.data.id,
    taskId: data.data.id,
    status: data.data.status,
  });
}