import { supabaseAdmin } from "@/app/lib/supabaseAdmin";

const BUCKET = "generated-images";
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
let bucketReady: Promise<void> | null = null;

async function ensureBucket() {
  if (!bucketReady) bucketReady = (async () => {
    const { data } = await supabaseAdmin.storage.getBucket(BUCKET);
    if (data) return;
    const { error } = await supabaseAdmin.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: MAX_IMAGE_BYTES,
      allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
    });
    if (error && !/already exists|duplicate/i.test(error.message)) throw error;
  })().catch((error) => { bucketReady = null; throw error; });
  return bucketReady;
}

export async function archiveGeneratedImage(sourceUrl: string, userId: string) {
  const url = new URL(sourceUrl);
  if (url.protocol !== "https:") throw new Error("生成图片地址必须使用 HTTPS");
  await ensureBucket();
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000), cache: "no-store" });
  if (!response.ok) throw new Error(`下载生成图片失败（${response.status}）`);
  const payload = new Uint8Array(await response.arrayBuffer());
  if (!payload.length || payload.length > MAX_IMAGE_BYTES) throw new Error("生成图片为空或超过 20MB 存储上限");
  const contentType = response.headers.get("content-type")?.split(";")[0] || "image/jpeg";
  const extension = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
  const path = `${userId.replace(/[^a-zA-Z0-9_-]/g, "-")}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(path, payload, { contentType, upsert: false });
  if (error) throw error;
  return supabaseAdmin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}
