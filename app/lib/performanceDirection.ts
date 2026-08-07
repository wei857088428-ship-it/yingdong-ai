export function hasPerformanceDirection(value?: string) {
  const performance = String(value ?? "");
  const hasEmotion = /(?:表演|情绪|语气|口吻|performance|emotion|tone)\s*[:：]\s*\S+/i.test(performance);
  const hasIntensity = /(?:强度|intensity)\s*[:：]?\s*[1-5]/i.test(performance);
  const hasDelivery = /(?:语速|速度|节奏|音量|轻声|低声|大喊|耳语|慢速|快速|pace|speed|volume|whisper|soft|loud)/i.test(performance);
  return hasEmotion && hasIntensity && hasDelivery;
}
