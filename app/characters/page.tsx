"use client";

import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/app/lib/supabase";

type Slot = "front" | "left" | "right" | "full";
type Character = { id: string; name: string; description: string; version: number; images: Record<Slot, string | undefined> };
const slots: Array<{ key: Slot; label: string }> = [{ key: "front", label: "正面" }, { key: "left", label: "左45°" }, { key: "right", label: "右45°" }, { key: "full", label: "全身" }];

export default function CharactersPage() {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [characters, setCharacters] = useState<Character[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<Partial<Record<Slot, File>>>({});
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { router.replace("/login"); return; }
      setUserId(data.user.id);
      const { data: rows } = await supabase.from("characters").select("id,name,description,version,images").order("updated_at", { ascending: false });
      setCharacters((rows ?? []) as Character[]);
    });
  }, [router]);

  async function save(event: FormEvent) {
    event.preventDefault(); if (!userId || saving) return; setSaving(true); setStatus("正在上传角色参考图…");
    try {
      const images: Partial<Record<Slot, string>> = {};
      for (const { key } of slots) {
        const file = files[key]; if (!file) continue;
        if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) throw new Error("每张参考图必须是 5MB 以内的图片");
        const extension = file.name.split(".").pop() || "jpg"; const path = `${userId}/${crypto.randomUUID()}-${key}.${extension}`;
        const { error } = await supabase.storage.from("character-references").upload(path, file); if (error) throw error;
        images[key] = supabase.storage.from("character-references").getPublicUrl(path).data.publicUrl;
      }
      if (!images.front) throw new Error("至少需要上传一张正面参考图");
      const { data, error } = await supabase.from("characters").insert({ user_id: userId, name: name.trim(), description: description.trim(), images }).select("id,name,description,version,images").single();
      if (error) throw error; setCharacters((current) => [data as Character, ...current]); setName(""); setDescription(""); setFiles({}); setStatus(`${data.name} V1 创建成功`);
    } catch (error) { setStatus(error instanceof Error ? error.message : "创建角色失败"); }
    finally { setSaving(false); }
  }

  return <main className="character-page"><header className="admin-head"><Link className="wordmark" href="/"><span>影</span><b>影动 AI</b></Link><Link href="/dashboard">返回漫剧工作台</Link></header><section className="character-view"><div className="character-head"><p className="eyebrow">CHARACTER BIBLE</p><h1>角色库 V1</h1><p>上传角色正面、左右45°和全身参考图。创建后可在图片和视频模式中绑定角色。</p></div><form className="character-form" onSubmit={save}><div><label>角色名称</label><input required value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：林川"/></div><div><label>固定外貌与服装</label><textarea required value={description} onChange={(e) => setDescription(e.target.value)} placeholder="例如：25岁中国男性，黑色短发，剑眉，左眼下方有小痣，黑色夹克…"/></div><div className="reference-grid">{slots.map((slot) => <label key={slot.key}><b>{slot.label}</b><span>{files[slot.key]?.name || "上传参考图"}</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setFiles((current) => ({ ...current, [slot.key]: e.target.files?.[0] }))}/></label>)}</div><button disabled={saving}>{saving ? "正在创建…" : "创建角色 V1"}</button></form>{status && <div className="character-status">{status}</div>}<div className="character-grid">{characters.map((character) => <article key={character.id}>{character.images.front ? <Image src={character.images.front} alt={character.name} width={400} height={500} unoptimized/> : <div className="character-placeholder">人</div>}<div><b>{character.name} V{character.version}</b><p>{character.description}</p><Link href="/dashboard">进入创作台绑定 ↗</Link></div></article>)}</div></section></main>;
}
