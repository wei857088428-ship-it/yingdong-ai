import type { SupabaseClient } from "@supabase/supabase-js";

function sourcePath(userId: string, projectId: string, shotId: string) {
  return `${userId}/${projectId}/${shotId}.video-source.json`;
}

export async function preserveLipSyncSource(supabase: SupabaseClient, userId: string, projectId: string, shotId: string, videoUrl: string) {
  const path = sourcePath(userId, projectId, shotId);
  const existing = await supabase.storage.from("storyboard-audio").download(path);
  if (existing.data) {
    try {
      const saved = JSON.parse(await existing.data.text()) as { videoUrl?: unknown };
      if (String(saved.videoUrl ?? "").trim() === videoUrl.trim()) return;
    } catch { /* Replace malformed or legacy source metadata below. */ }
  }
  const payload = new TextEncoder().encode(JSON.stringify({ version: 1, videoUrl }));
  // storyboard-audio currently permits audio/mpeg only; the file extension identifies JSON metadata.
  const { error } = await supabase.storage.from("storyboard-audio").upload(path, payload, { contentType: "audio/mpeg", upsert: true });
  if (error && !/already exists|duplicate/i.test(error.message)) throw error;
}

export async function originalVideoUrl(supabase: SupabaseClient, userId: string, projectId: string, shotId: string) {
  const { data } = await supabase.storage.from("storyboard-audio").download(sourcePath(userId, projectId, shotId));
  if (!data) return null;
  try {
    const parsed = JSON.parse(await data.text()) as { videoUrl?: unknown };
    const url = typeof parsed.videoUrl === "string" ? parsed.videoUrl.trim() : "";
    return /^https:\/\//i.test(url) ? url : null;
  } catch { return null; }
}
