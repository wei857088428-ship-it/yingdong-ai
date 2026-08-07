export const officialVoiceIds = ["ara", "eve", "leo", "rex", "sal"] as const;
export type OfficialVoiceId = typeof officialVoiceIds[number];

const femaleLegacy = new Set(["carina", "luna", "iris"]);
const maleLegacy = new Set(["orion", "perseus", "zagan", "helix", "altair", "zenith", "helios", "lux", "kepler"]);

export function normalizeVoiceId(value: string | null | undefined, fallback: OfficialVoiceId = "sal"): OfficialVoiceId {
  const id = String(value ?? "").trim().toLowerCase();
  if ((officialVoiceIds as readonly string[]).includes(id)) return id as OfficialVoiceId;
  if (femaleLegacy.has(id)) return id === "carina" ? "ara" : "eve";
  if (maleLegacy.has(id)) return id === "orion" ? "leo" : "rex";
  return fallback;
}
