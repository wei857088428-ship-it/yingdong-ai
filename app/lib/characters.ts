import { createServerSupabaseClient } from "@/app/lib/supabaseServer";

type CharacterImages = { front?: string; left?: string; right?: string; full?: string };
export type CharacterRecord = { id: string; name: string; description: string; version: number; images: CharacterImages };

export async function getCharacter(userId: string, characterId?: string) {
  if (!characterId) return null;
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.from("characters").select("id,name,description,version,images").eq("id", characterId).eq("user_id", userId).maybeSingle();
  return data as CharacterRecord | null;
}

export function characterPrompt(character: CharacterRecord | null) {
  if (!character) return "";
  const refs = Object.values(character.images ?? {}).filter(Boolean).join(", ");
  return `\n\n角色一致性要求：Use ${character.name} Character V${character.version}. Same identity, same face, same facial features, same hairstyle, same clothes, same body proportions. Do not change identity. 固定设定：${character.description || "保持参考图人物设定"}。角色参考图：${refs}`;
}
