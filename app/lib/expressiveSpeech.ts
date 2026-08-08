import { primaryPerformanceDirection } from "@/app/lib/performanceArc";

function has(direction: string, pattern: RegExp) { return pattern.test(direction); }

export function expressiveSpeech(dialogue: string, performanceContext: string) {
  const direction = primaryPerformanceDirection(performanceContext);
  const intensity = Math.min(5, Math.max(1, Number(direction.match(/(?:强度|intensity)\s*[:：]?\s*([1-5])/i)?.[1] ?? 2)));
  const whisper = has(direction, /耳语|低声|压低声音|气若游丝|屏息|悄声/);
  const fearful = has(direction, /惊恐|恐惧|害怕|颤抖|紧张|焦虑|不安|慌张/);
  const angry = has(direction, /愤怒|暴怒|怒吼|咆哮|质问|仇恨/);
  const grieving = has(direction, /悲伤|悲痛|绝望|哽咽|哭泣|抽泣/);
  const determined = has(direction, /坚定|果断|决绝|命令|保护|守护|不容置疑/);
  const tender = has(direction, /温柔|安慰|关切|心疼|深情|柔和/);
  const shocked = has(direction, /震惊|惊讶|错愕|不敢相信|猛然发现/);
  const suspicious = has(direction, /怀疑|试探|警惕|疑惑|追问/);
  const pleading = has(direction, /恳求|哀求|祈求|求你|请求|乞求/);
  const restrained = has(direction, /克制|压抑|隐忍|冷静|冰冷|麻木/);
  const weak = has(direction, /微弱|虚弱|重伤|奄奄一息/);
  const urgent = has(direction, /急促|大喊|警告|崩溃|紧迫/) || /[！!]/.test(dialogue);
  const slow = has(direction, /语速[^；。]*(?:慢|缓|迟)|缓慢|慢慢/);
  const fast = has(direction, /语速[^；。]*(?:快|急)|快速|急促/);
  const soft = whisper || has(direction, /音量[^；。]*(?:低|轻|小|压低)|轻声|柔声/);
  const loud = has(direction, /音量[^；。]*(?:高|大|响)|高声|大声|怒吼|咆哮/);

  let spoken = dialogue.trim().replace(/……|…/g, (value) => `${value} [long-pause] `);
  // A short audible reaction before the first word makes the performance feel
  // motivated and gives the lip-sync model a stable closed-mouth lead-in.
  if (fearful) spoken = `[inhale] ${spoken}${intensity >= 4 ? " [breath]" : ""}`;
  else if (grieving) spoken = `[sigh] ${spoken}${/哭泣|抽泣|落泪/.test(direction) ? " [cry]" : ""}`;
  else if (shocked) spoken = `[inhale] ${spoken}`;
  else if (determined) spoken = `[breath] ${spoken}`;

  let text = spoken;
  if (whisper) text = `<whisper><soft>${text}</soft></whisper>`;
  else if (weak) text = `<slow><soft>${text}</soft></slow>`;
  else if (angry && intensity >= 4) text = `<build-intensity><loud>${text}</loud></build-intensity>`;
  else if (angry || urgent) text = `<emphasis>${text}</emphasis>`;
  else if (grieving) text = `<slow><soft>${text}</soft></slow>`;
  else if (fearful || shocked) text = `<higher-pitch>${text}</higher-pitch>`;
  else if (pleading) text = `<soft><build-intensity>${text}</build-intensity></soft>`;
  else if (determined) text = `<lower-pitch><emphasis>${text}</emphasis></lower-pitch>`;
  else if (restrained || suspicious) text = `<slow><soft>${text}</soft></slow>`;
  else if (tender) text = `<soft>${text}</soft>`;

  if (soft && !/<(?:soft|whisper)>/.test(text)) text = `<soft>${text}</soft>`;
  else if (loud && !/<(?:loud|soft|whisper)>/.test(text)) text = `<loud>${text}</loud>`;
  if (slow && !/<slow>/.test(text)) text = `<slow>${text}</slow>`;
  else if (fast && !/<(?:fast|slow)>/.test(text)) text = `<fast>${text}</fast>`;

  const speed = slow ? 0.9 : fast ? 1.08 : whisper || restrained || suspicious || tender ? 0.93 : fearful || pleading ? 0.96 : angry || urgent ? 1.04 : 0.98;
  return { text, speed: Math.min(1.2, Math.max(0.78, speed)) };
}
