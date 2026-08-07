"use client";

import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/app/lib/supabase";
import { characterVoiceOptions, normalizeVoiceId } from "@/app/lib/voiceCatalog";

type Slot = "front" | "left" | "right" | "full";
type Character = { id: string; name: string; description: string; version: number; images: Record<Slot, string | undefined>; voice_id: string; voice_language: string };
const slots: Array<{ key: Slot; label: string }> = [{ key: "front", label: "正面" }, { key: "left", label: "左45°" }, { key: "right", label: "右45°" }, { key: "full", label: "全身" }];
const voices = characterVoiceOptions.map((voice)=>({id:voice.id,label:`${voice.id[0].toUpperCase()}${voice.id.slice(1)} · ${voice.label}`}));
const femaleVoiceIds = new Set(["carina","luna","iris","eve","ara"]);
const maleVoiceIds = new Set(["zagan","orion","helix","atlas","rex","leo"]);
const voiceGroups = [
  { id:"female", label:"女声", voices:voices.filter((voice)=>femaleVoiceIds.has(voice.id)) },
  { id:"male", label:"男声", voices:voices.filter((voice)=>maleVoiceIds.has(voice.id)) },
  { id:"neutral", label:"旁白 / 中性", voices:voices.filter((voice)=>!femaleVoiceIds.has(voice.id)&&!maleVoiceIds.has(voice.id)) },
] as const;

export default function CharactersPage() {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [characters, setCharacters] = useState<Character[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [voiceProfile, setVoiceProfile] = useState("");
  const [voiceId, setVoiceId] = useState("");
  const [voiceLanguage, setVoiceLanguage] = useState("zh");
  const [files, setFiles] = useState<Partial<Record<Slot, File>>>({});
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { router.replace("/login"); return; }
      const requestedName = new URLSearchParams(window.location.search).get("name")?.trim();
      if (requestedName) { setName(requestedName); setStatus(`请上传 ${requestedName} 的正面参考图并完善固定外貌`); }
      setUserId(data.user.id);
      const { data: rows } = await supabase.from("characters").select("id,name,description,version,images,voice_id,voice_language").order("updated_at", { ascending: false });
      setCharacters(((rows ?? []) as Character[]).map((character) => ({ ...character, voice_id: normalizeVoiceId(character.voice_id) })));
    });
  }, [router]);

  async function save(event: FormEvent) {
    event.preventDefault(); if (!userId || saving) return; setSaving(true); setStatus("正在上传角色参考图…");
    try {
      if (!voiceProfile || !voiceId) throw new Error("请选择角色声音类型和固定音色");
      const images: Partial<Record<Slot, string>> = {};
      for (const { key } of slots) {
        const file = files[key]; if (!file) continue;
        if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) throw new Error("每张参考图必须是 5MB 以内的图片");
        const extension = file.name.split(".").pop() || "jpg"; const path = `${userId}/${crypto.randomUUID()}-${key}.${extension}`;
        const { error } = await supabase.storage.from("character-references").upload(path, file); if (error) throw error;
        images[key] = supabase.storage.from("character-references").getPublicUrl(path).data.publicUrl;
      }
      if (!images.front) throw new Error("至少需要上传一张正面参考图");
      const { data, error } = await supabase.from("characters").insert({ user_id: userId, name: name.trim(), description: description.trim(), images, voice_id: voiceId, voice_language: voiceLanguage }).select("id,name,description,version,images,voice_id,voice_language").single();
      if (error) throw error; setCharacters((current) => [data as Character, ...current]); setName(""); setDescription(""); setVoiceProfile("");setVoiceId("");setFiles({}); setStatus(`${data.name} V1 创建成功，已固定使用 ${voices.find((voice)=>voice.id===data.voice_id)?.label??data.voice_id}`);
    } catch (error) { setStatus(error instanceof Error ? error.message : "创建角色失败"); }
    finally { setSaving(false); }
  }

  async function updateVoice(character: Character, nextVoiceId: string) {
    const { error } = await supabase.from("characters").update({ voice_id: nextVoiceId }).eq("id", character.id).eq("user_id", userId);
    if (error) return setStatus(error.message);
    setCharacters((current) => current.map((item) => item.id === character.id ? { ...item, voice_id: nextVoiceId } : item));
    setStatus(`${character.name} 已固定使用 ${voices.find((voice) => voice.id === nextVoiceId)?.label ?? nextVoiceId}`);
  }

  async function addReference(character: Character, slot: Slot, file?: File) {
    if (!file || saving) return;
    if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) return setStatus("每张参考图必须是 5MB 以内的图片");
    setSaving(true); setStatus(`正在为 ${character.name} 补充${slots.find((item) => item.key === slot)?.label}参考图…`);
    try {
      const extension=file.name.split(".").pop()||"jpg";const path=`${userId}/${character.id}-${slot}-${crypto.randomUUID()}.${extension}`;
      const { error: uploadError }=await supabase.storage.from("character-references").upload(path,file);if(uploadError)throw uploadError;
      const url=supabase.storage.from("character-references").getPublicUrl(path).data.publicUrl;const images={...character.images,[slot]:url};
      const { error }=await supabase.from("characters").update({images}).eq("id",character.id).eq("user_id",userId);if(error)throw error;
      setCharacters((current)=>current.map((item)=>item.id===character.id?{...item,images}:item));setStatus(`${character.name} 的多角度参考已更新，后续镜头会自动使用`);
    } catch(error) { setStatus(error instanceof Error?error.message:"补充参考图失败"); }
    finally { setSaving(false); }
  }

  return <main className="character-page"><header className="admin-head"><Link className="wordmark" href="/"><span>影</span><b>影动 AI</b></Link><Link href="/dashboard">返回漫剧工作台</Link></header><section className="character-view"><div className="character-head"><p className="eyebrow">CHARACTER BIBLE</p><h1>角色库 V1</h1><p>上传多角度参考图，并为每个角色固定配音，保持每一集的形象和声音一致。</p></div><form className="character-form" onSubmit={save}><div><label>角色名称</label><input required value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：林川"/></div><div><label>固定外貌与服装</label><textarea required value={description} onChange={(e) => setDescription(e.target.value)} placeholder="例如：25岁中国男性，黑色短发，剑眉，左眼下方有小痣，黑色夹克…"/></div><div><label>角色声音类型</label><select required value={voiceProfile} onChange={(e)=>{const profile=e.target.value;setVoiceProfile(profile);setVoiceId(profile==="female"?"carina":profile==="male"?"orion":profile==="neutral"?"sal":"");}}><option value="">请选择，防止男女声选错</option>{voiceGroups.map((group)=><option key={group.id} value={group.id}>{group.label}</option>)}</select></div><div><label>固定角色音色</label><select required disabled={!voiceProfile} value={voiceId} onChange={(e) => setVoiceId(e.target.value)}><option value="">先选择声音类型</option>{voiceGroups.find((group)=>group.id===voiceProfile)?.voices.map((voice)=><option key={voice.id} value={voice.id}>{voice.label}</option>)}</select></div><div><label>配音语言</label><select value={voiceLanguage} onChange={(e) => setVoiceLanguage(e.target.value)}><option value="zh">普通话</option><option value="en">英语</option><option value="ja">日语</option><option value="auto">自动识别</option></select></div><div className="reference-grid">{slots.map((slot) => <label key={slot.key}><b>{slot.label}</b><span>{files[slot.key]?.name || "上传参考图"}</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setFiles((current) => ({ ...current, [slot.key]: e.target.files?.[0] }))}/></label>)}</div><button disabled={saving}>{saving ? "正在创建…" : "创建角色 V1"}</button></form>{status && <div className="character-status">{status}</div>}<div className="character-grid">{characters.map((character) => <article key={character.id}>{character.images.front ? <Image src={character.images.front} alt={character.name} width={400} height={500} unoptimized/> : <div className="character-placeholder">人</div>}<div><b>{character.name} V{character.version}</b><p>{character.description}</p><div className="reference-completeness"><span>{slots.filter((slot)=>character.images?.[slot.key]).length}/4 参考角度</span>{slots.filter((slot)=>!character.images?.[slot.key]).map((slot)=><label key={slot.key}>补充{slot.label}<input disabled={saving} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event)=>void addReference(character,slot.key,event.target.files?.[0])}/></label>)}</div><label className="voice-profile">固定音色<select value={character.voice_id || "sal"} onChange={(e) => void updateVoice(character, e.target.value)}>{voiceGroups.map((group)=><optgroup key={group.id} label={group.label}>{group.voices.map((voice)=><option key={voice.id} value={voice.id}>{voice.label}</option>)}</optgroup>)}</select></label><Link href="/dashboard">进入创作台绑定 ↗</Link></div></article>)}</div></section></main>;
}
