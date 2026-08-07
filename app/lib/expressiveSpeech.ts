export function expressiveSpeech(dialogue: string, performanceContext: string) {
  const intensity = Math.min(5, Math.max(1, Number(performanceContext.match(/(?:强度|intensity)\s*[:：]?\s*([1-5])/i)?.[1] ?? 2)));
  const whispering = /耳语|低声|压低声音|气若游丝|屏息|悄声/.test(performanceContext);
  const weak = /微弱|虚弱|重伤|奄奄一息/.test(performanceContext);
  const angry = /愤怒|暴怒|咆哮|怒吼|质问|仇恨/.test(performanceContext);
  const grieving = /悲伤|失去|绝望|哽咽|悲痛/.test(performanceContext);
  const crying = /哭泣|哭着|落泪|泪流|抽泣/.test(performanceContext);
  const frightened = /惊恐|恐惧|害怕|颤抖|怪物|丧尸/.test(performanceContext);
  const relieved = /松了口气|如释重负|终于安全|得救/.test(performanceContext);
  const chuckling = /轻笑|冷笑|苦笑|笑着说|忍不住笑/.test(performanceContext);
  const cheerful = /开心|兴奋|喜悦|惊喜/.test(performanceContext);
  const shocked = /震惊|惊讶|错愕|不敢相信|猛然发现|倒吸凉气/.test(performanceContext);
  const determined = /坚定|果断|决绝|下定决心|命令|不容置疑|守护/.test(performanceContext);
  const restrained = /冷漠|冰冷|克制|压抑|隐忍|麻木|平静得可怕|面无表情/.test(performanceContext);
  const suspicious = /怀疑|试探|警惕|不确定|疑惑|追问/.test(performanceContext);
  const sarcastic = /讽刺|嘲讽|嘲笑|戏谑|阴阳怪气|挑衅/.test(performanceContext);
  const pleading = /恳求|哀求|祈求|求你|请求|乞求/.test(performanceContext);
  const urgent = /急促|大喊|冲向|警告|追赶|崩溃|警戒|紧绷|保护|危险/.test(performanceContext) || /！|!/.test(dialogue);
  const deliberatePause = /停顿|迟疑|犹豫|欲言又止|沉默片刻/.test(performanceContext);

  let paced = dialogue.trim().replace(/……|…+/g, (value) => `${value} [long-pause] `);
  if (deliberatePause && !paced.includes("[pause]")) paced = paced.replace(/([，,；;])/, "$1 [pause] ");

  let text = paced;
  if (whispering) text = `<whisper><soft>${paced}</soft></whisper>`;
  else if (weak) text = `[breath] <slow><soft>${paced}</soft></slow>`;
  else if (angry && intensity >= 4) text = `<build-intensity><loud>${paced}</loud></build-intensity>`;
  else if (angry) text = `<emphasis>${paced}</emphasis>`;
  else if (grieving) text = `[sigh] <slow><soft>${paced}</soft></slow>${crying ? " [cry]" : ""}`;
  else if (frightened) text = `[inhale] <higher-pitch>${paced}</higher-pitch>${intensity >= 4 ? " [breath]" : ""}`;
  else if (relieved) text = `[exhale] <soft>${paced}</soft>`;
  else if (chuckling) text = `[chuckle] <laugh-speak>${paced}</laugh-speak>`;
  else if (cheerful) text = `<higher-pitch>${paced}</higher-pitch>`;
  else if (shocked) text = `[inhale] <higher-pitch><emphasis>${paced}</emphasis></higher-pitch>`;
  else if (pleading) text = `<soft><build-intensity>${paced}</build-intensity></soft>`;
  else if (sarcastic) text = `<lower-pitch><emphasis>${paced}</emphasis></lower-pitch>`;
  else if (urgent && intensity >= 4) text = `<build-intensity>${paced}</build-intensity>`;
  else if (urgent) text = `<emphasis>${paced}</emphasis>`;
  else if (determined) text = `<lower-pitch><emphasis>${paced}</emphasis></lower-pitch>`;
  else if (restrained) text = `<decrease-intensity><slow>${paced}</slow></decrease-intensity>`;
  else if (suspicious) text = `<slow><soft>${paced}</soft></slow>`;

  const instructedSlow = /语速[^；。]*(?:慢|缓)|缓慢|慢慢/.test(performanceContext);
  const instructedFast = /语速[^；。]*(?:快|急)|快速|急促/.test(performanceContext);
  const naturalSpeed = instructedSlow ? 0.9 : instructedFast ? 1.08 : grieving || weak ? 0.9 : restrained ? 0.91 : whispering || suspicious ? 0.94 : pleading ? 0.96 : shocked ? 1.03 : angry || urgent ? 1 + intensity * 0.012 : 0.98;
  return { text, speed: Math.min(1.2, Math.max(0.78, naturalSpeed)) };
}
