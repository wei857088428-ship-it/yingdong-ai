import { createServerSupabaseClient } from "@/app/lib/supabaseServer";

export type UsageKind = "chat" | "image" | "video" | "audio";
const policy: Record<UsageKind, { cost: number; limit: number; window: number }> = {
  chat: { cost: 1, limit: 20, window: 60 },
  image: { cost: 20, limit: 4, window: 60 },
  video: { cost: 80, limit: 2, window: 300 },
  audio: { cost: 2, limit: 30, window: 60 },
};
const batchPolicy: Partial<Record<UsageKind, { cost: number; limit: number; window: number }>> = {
  image: { cost: 20, limit: 30, window: 3600 },
  video: { cost: 80, limit: 20, window: 3600 },
  audio: { cost: 2, limit: 100, window: 3600 },
};

export async function reserveUsage(userId: string, kind: UsageKind, batch = false) {
  const supabase = await createServerSupabaseClient();
  const rule = batch ? batchPolicy[kind] ?? policy[kind] : policy[kind];
  const { data, error } = await supabase.rpc("reserve_credits", {
    p_user_id: userId, p_kind: kind, p_cost: rule.cost, p_limit: rule.limit, p_window_seconds: rule.window,
  });
  if (error) throw new Error(error.message);
  const result = data as { ok: boolean; reason?: string; event_id?: string; credits?: number };
  if (!result.ok) {
    if (result.reason === "insufficient") throw new Error("积分不足，请充值后继续使用");
    if (result.reason === "rate_limit") throw new Error("操作太频繁，请稍后再试");
    throw new Error("账户积分状态异常，请联系管理员");
  }
  return { eventId: result.event_id!, credits: Number(result.credits ?? 0), cost: rule.cost };
}

export async function finishUsage(userId: string, eventId: string, success: boolean) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("finish_usage", { p_user_id: userId, p_event_id: eventId, p_success: success });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}
