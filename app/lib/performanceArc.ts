type PerformanceBeat = { dialogue?: string; performance?: string; speakerKey?: string | null };

export function primaryPerformanceDirection(value?: string) {
  const text = String(value ?? "");
  return text.match(/(?:表演|情绪|语气|口吻)\s*[:：]\s*([\s\S]*?)(?=[，,；;。]\s*(?:潜台词|声音|环境声|动作音效)\s*[:：]?|$)/)?.[1]?.trim() || text;
}

export function performanceSignature(value?: string) {
  const text = String(value ?? "").toLocaleLowerCase("zh-CN");
  const direction = primaryPerformanceDirection(text);
  const categoryGroups: Array<[string, RegExp]> = [
    ["anger", /愤怒|暴怒|怒吼|咆哮|质问|仇恨/], ["fear", /恐惧|惊恐|害怕|颤抖/],
    ["grief", /悲伤|悲痛|绝望|哽咽|哭泣|抽泣/], ["joy", /开心|喜悦|兴奋|惊喜|振奋/],
    ["tender", /温柔|关切|安慰|心疼|深情/], ["determined", /坚定|果断|决绝|命令/],
    ["suspicious", /怀疑|试探|警惕|疑惑/], ["nervous", /紧张|焦虑|不安|慌张/],
    ["restrained", /克制|压抑|隐忍|冷漠|冰冷|麻木/], ["shocked", /震惊|惊讶|错愕/],
    ["pleading", /恳求|哀求|祈求|乞求/], ["remorse", /愧疚|后悔|自责|歉意/],
    ["playful", /俏皮|调皮|打趣|撒娇/], ["relieved", /放松|如释重负|松了口气/],
  ];
  const category = categoryGroups.find(([, pattern]) => pattern.test(direction))?.[0]
    ?? direction.match(/^([^，,；;。]{1,12})/)?.[1]?.replace(/\s/g, "")
    ?? "unspecified";
  const intensity = direction.match(/(?:强度|intensity)\s*[:：]?\s*([1-5])/i)?.[1] ?? "?";
  const pace = /语速[^；。]*(?:快|急)|快速|急促/.test(direction) ? "fast" : /语速[^；。]*(?:慢|缓)|缓慢|慢慢/.test(direction) ? "slow" : "normal";
  const volume = /耳语|轻声|低声|柔声|音量[^；。]*(?:低|轻|小)/.test(direction) ? "soft" : /大声|高声|怒吼|咆哮|音量[^；。]*(?:高|大|响)/.test(direction) ? "loud" : "normal";
  return `${category}|${intensity}|${pace}|${volume}`;
}

export function flatPerformanceRun(items: PerformanceBeat[], minimumRun = 3) {
  const spoken = items.filter((item) => String(item.dialogue ?? "").trim());
  const bySpeaker = new Map<string, Array<{ item: PerformanceBeat; spokenIndex: number }>>();
  spoken.forEach((item, spokenIndex) => {
    const key = String(item.speakerKey ?? "").trim().toLocaleLowerCase("zh-CN") || "__narrator__";
    bySpeaker.set(key, [...(bySpeaker.get(key) ?? []), { item, spokenIndex }]);
  });
  for (const [speakerKey, beats] of bySpeaker) {
    let start = 0;
    for (let index = 1; index <= beats.length; index++) {
      const changed = index === beats.length || performanceSignature(beats[index].item.performance) !== performanceSignature(beats[start].item.performance);
      if (!changed) continue;
      if (index - start >= minimumRun) return { startIndex: beats[start].spokenIndex, endIndex: beats[index - 1].spokenIndex, spokenIndexes: beats.slice(start, index).map((beat) => beat.spokenIndex), signature: performanceSignature(beats[start].item.performance), speakerKey };
      start = index;
    }
  }
  return undefined;
}

export function hasExpressivePerformanceArc(items: PerformanceBeat[]) {
  return !flatPerformanceRun(items);
}
