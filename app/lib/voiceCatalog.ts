export const officialVoiceIds = ["carina", "zagan", "helix", "orion", "luna", "iris", "altair", "zenith", "perseus", "helios", "lux", "kepler", "rigel", "cosmo", "celeste", "ursa", "sirius", "lumen", "castor", "naksh", "atlas", "ara", "eve", "leo", "rex", "sal"] as const;
export type OfficialVoiceId = typeof officialVoiceIds[number];

export const characterVoiceOptions: ReadonlyArray<{id:OfficialVoiceId;label:string}> = [
  { id:"carina", label:"温柔共情女声" }, { id:"luna", label:"温暖治愈女声" }, { id:"iris", label:"活泼自然女声" }, { id:"eve", label:"充满活力女声" }, { id:"ara", label:"亲切温暖女声" },
  { id:"zagan", label:"强烈戏剧角色声" }, { id:"orion", label:"浑厚电影旁白声" }, { id:"helix", label:"热血动态男声" }, { id:"atlas", label:"威严可靠男声" }, { id:"rex", label:"清晰自信男声" }, { id:"leo", label:"强势沉稳男声" },
  { id:"lux", label:"平静智慧旁白声" }, { id:"lumen", label:"温暖清晰叙事声" }, { id:"sal", label:"平衡通用旁白声" },
];

export function normalizeVoiceId(value: string | null | undefined, fallback: OfficialVoiceId = "sal"): OfficialVoiceId {
  const id = String(value ?? "").trim().toLowerCase();
  if ((officialVoiceIds as readonly string[]).includes(id)) return id as OfficialVoiceId;
  return fallback;
}
