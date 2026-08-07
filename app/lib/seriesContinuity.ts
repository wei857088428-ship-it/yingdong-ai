const WORLD_MARKER = "世界观背景：\n";
const HISTORY_MARKER = "\n\n系列历史账本：\n";
const EPISODE_MARKER = "\n\n本集镜头概要：\n";
const HISTORY_SEPARATOR = "\n\n---\n\n";

export function parseSeriesSource(source: string) {
  const clean = source.trim();
  if (!clean.startsWith(WORLD_MARKER)) return { world: clean, history: "", currentOutline: "" };
  const historyStart = clean.indexOf(HISTORY_MARKER);
  const episodeStart = clean.indexOf(EPISODE_MARKER);
  const worldEnd = [historyStart, episodeStart].filter((index) => index >= 0).sort((a, b) => a - b)[0] ?? clean.length;
  const history = historyStart >= 0
    ? clean.slice(historyStart + HISTORY_MARKER.length, episodeStart >= 0 ? episodeStart : clean.length).trim()
    : "";
  const currentOutline = episodeStart >= 0 ? clean.slice(episodeStart + EPISODE_MARKER.length).trim() : "";
  return { world: clean.slice(WORLD_MARKER.length, worldEnd).trim(), history, currentOutline };
}

export function appendSeriesHistory(history: string, title: string, outline: string, limit = 12_000) {
  const entry = `《${title.trim() || "未命名剧集"}》\n${outline.trim()}`.trim();
  const entries = [...history.split(HISTORY_SEPARATOR).map((item) => item.trim()).filter(Boolean), entry];
  while (entries.length > 1 && entries.join(HISTORY_SEPARATOR).length > limit) entries.shift();
  const combined = entries.join(HISTORY_SEPARATOR);
  return combined.length <= limit ? combined : combined.slice(-limit);
}

export function formatSeriesSource(world: string, history: string, currentOutline: string) {
  return `${WORLD_MARKER}${world.trim()}${HISTORY_MARKER}${history.trim()}${EPISODE_MARKER}${currentOutline.trim()}`;
}
