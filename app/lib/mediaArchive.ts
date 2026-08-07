import { supabaseAdmin } from "@/app/lib/supabaseAdmin";

const BUCKET = "generated-videos";
const MAX_VIDEO_BYTES = 150 * 1024 * 1024;
let bucketReady: Promise<void> | null = null;

async function ensureBucket() {
  if (!bucketReady) {
    bucketReady = (async () => {
      const { data } = await supabaseAdmin.storage.getBucket(BUCKET);
      if (data) return;
      const { error } = await supabaseAdmin.storage.createBucket(BUCKET, {
        public: true,
        fileSizeLimit: MAX_VIDEO_BYTES,
        allowedMimeTypes: ["video/mp4", "video/webm", "video/quicktime"],
      });
      if (error && !/already exists|duplicate/i.test(error.message)) throw error;
    })().catch((error) => { bucketReady = null; throw error; });
  }
  return bucketReady;
}

function safePart(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 160);
}

export async function archiveGeneratedVideo(sourceUrl: string, userId: string, category: "xai" | "lipsync", id: string) {
  const url = new URL(sourceUrl);
  if (url.protocol !== "https:") throw new Error("生成视频地址必须使用 HTTPS");
  await ensureBucket();
  const response = await fetch(url, { signal: AbortSignal.timeout(90_000), cache: "no-store" });
  if (!response.ok) throw new Error(`下载生成视频失败（${response.status}）`);
  const declaredSize = Number(response.headers.get("content-length") ?? 0);
  if (declaredSize > MAX_VIDEO_BYTES) throw new Error("生成视频超过 150MB 存储上限");
  const payload = new Uint8Array(await response.arrayBuffer());
  if (!payload.length || payload.length > MAX_VIDEO_BYTES) throw new Error("生成视频为空或超过 150MB 存储上限");
  const contentType = response.headers.get("content-type")?.split(";")[0] || "video/mp4";
  const extension = contentType === "video/webm" ? "webm" : contentType === "video/quicktime" ? "mov" : "mp4";
  const path = `${safePart(userId)}/${category}/${safePart(id)}.${extension}`;
  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(path, payload, { contentType, upsert: true });
  if (error) throw error;
  return supabaseAdmin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}
