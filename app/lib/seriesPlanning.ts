export const SERIES_PLAN_COUNTS = [3, 10, 20] as const;

export function boundedEpisodePlanCount(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(20, Math.max(1, Math.floor(value)));
}
