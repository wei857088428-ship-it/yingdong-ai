export type SpeakerVoiceProfile = "female" | "male" | "neutral";

export function normalizeSpeakerName(value: string) {
  return value.trim().toLocaleLowerCase("zh-CN").replace(/[\s·・._-]+/g, "");
}

export function stableSpeakerVoice(name: string, profile?: SpeakerVoiceProfile) {
  const normalized = normalizeSpeakerName(name);
  if (!normalized) return "sal";
  let hash = 0;
  for (const char of normalized) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const inferred: SpeakerVoiceProfile = /苏雨晴|雨晴|女孩|少女|女人|女性|女主|小美|雪|月|瑶|娜|婷|兰|梅|芳/.test(name) ? "female" : "male";
  const resolved = profile ?? inferred;
  const choices = resolved === "female" ? ["eve", "ara"] : resolved === "male" ? ["rex", "leo"] : ["sal"];
  return choices[hash % choices.length];
}
