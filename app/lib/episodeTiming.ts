export function resolvedShotDuration(declaredSeconds: number, measuredVideoSeconds?: number) {
  const declared = Number.isFinite(declaredSeconds) && declaredSeconds > 0 ? declaredSeconds : 0;
  const measured = Number.isFinite(measuredVideoSeconds) && Number(measuredVideoSeconds) > 0 ? Number(measuredVideoSeconds) : 0;
  return Math.max(2, declared, measured);
}

export function mediaProbeNeeded(cachedUrl: string | undefined, currentUrl: string | undefined) {
  return Boolean(currentUrl && cachedUrl !== currentUrl);
}
