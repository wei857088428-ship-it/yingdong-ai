export function resolvedShotDuration(declaredSeconds: number, measuredVideoSeconds?: number) {
  const declared = Number.isFinite(declaredSeconds) && declaredSeconds > 0 ? declaredSeconds : 0;
  const measured = Number.isFinite(measuredVideoSeconds) && Number(measuredVideoSeconds) > 0 ? Number(measuredVideoSeconds) : 0;
  return Math.max(2, declared, measured);
}

export function mediaProbeNeeded(cachedUrl: string | undefined, currentUrl: string | undefined) {
  return Boolean(currentUrl && cachedUrl !== currentUrl);
}

export function metadataRetryDecision(failureCount: number, maximumFailures = 3) {
  const failures = Math.max(1, Math.floor(Number(failureCount) || 1));
  return failures < maximumFailures ? { action: "retry" as const, delayMs: 600 * failures } : { action: "failed" as const, delayMs: 0 };
}
