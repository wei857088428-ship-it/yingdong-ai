import type { SupabaseClient } from "@supabase/supabase-js";

function jobPath(userId: string, projectId: string, shotId: string) {
  return `${userId}/${projectId}/${shotId}.lipsync-job.json`;
}

export async function saveLipSyncJob(supabase: SupabaseClient, userId: string, projectId: string, shotId: string, jobId: string, mode: string) {
  const payload = new TextEncoder().encode(JSON.stringify({ version: 1, jobId, mode, createdAt: new Date().toISOString() }));
  const { error } = await supabase.storage.from("storyboard-audio").upload(jobPath(userId, projectId, shotId), payload, { contentType: "audio/mpeg", upsert: true });
  if (error) throw error;
}

export async function loadLipSyncJob(supabase: SupabaseClient, userId: string, projectId: string, shotId: string) {
  const { data } = await supabase.storage.from("storyboard-audio").download(jobPath(userId, projectId, shotId));
  if (!data) return null;
  try {
    const value = JSON.parse(await data.text()) as { jobId?: unknown };
    const jobId = String(value.jobId ?? "").trim();
    return /^[\w-]{4,160}$/.test(jobId) ? jobId : null;
  } catch { return null; }
}
