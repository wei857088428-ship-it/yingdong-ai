export type LipSyncPollDecision = "continue" | "retry" | "completed" | "failed" | "error";

const completed = new Set(["completed", "complete", "done", "success"]);
const failed = new Set(["failed", "error", "canceled", "cancelled"]);

export function lipSyncPollDecision(httpStatus: number, taskStatus: string, consecutiveFailures: number): LipSyncPollDecision {
  const normalized = taskStatus.trim().toLowerCase();
  if (httpStatus >= 200 && httpStatus < 300) {
    if (completed.has(normalized)) return "completed";
    if (failed.has(normalized)) return "failed";
    return "continue";
  }
  const transient = httpStatus === 0 || httpStatus === 408 || httpStatus === 425 || httpStatus === 429 || httpStatus >= 500;
  if (transient && consecutiveFailures <= 6) return "retry";
  return "error";
}
