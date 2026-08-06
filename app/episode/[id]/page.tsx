"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/app/lib/supabase";

type Shot = { id:string; shot_number:number; duration_seconds:number; scene:string; dialogue:string; image_url?:string; video_url?:string; audio_url?:string; voice_id?:string };
type Project = { id:string; title:string; created_at:string; storyboard_shots:Shot[] };

export default function EpisodePage() {
  const params = useParams<{ id:string }>(); const router = useRouter();
  const [project,setProject] = useState<Project|null>(null); const [index,setIndex] = useState(0); const [playing,setPlaying] = useState(false); const [elapsed,setElapsed] = useState(0); const [error,setError] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null); const audioRef = useRef<HTMLAudioElement>(null);
  const shots = useMemo(() => project?.storyboard_shots ?? [], [project]); const shot = shots[index];
  const total = useMemo(() => shots.reduce((sum,item)=>sum+item.duration_seconds,0),[shots]);
  const before = useMemo(() => shots.slice(0,index).reduce((sum,item)=>sum+item.duration_seconds,0),[shots,index]);

  useEffect(() => { supabase.auth.getUser().then(async ({data}) => { if(!data.user){router.replace("/login");return;} const response=await fetch(`/api/storyboard/projects/${params.id}`,{cache:"no-store"}); const body=await response.json(); if(!response.ok){setError(body.error);return;} setProject(body.project); }); },[params.id,router]);
  useEffect(() => { if(!playing || !shot) return; videoRef.current?.play().catch(()=>undefined); audioRef.current?.play().catch(()=>undefined); const started=Date.now(); const timer=window.setInterval(()=>{ const seconds=(Date.now()-started)/1000; setElapsed(Math.min(seconds,shot.duration_seconds)); if(seconds>=shot.duration_seconds){ window.clearInterval(timer); if(index<shots.length-1){setElapsed(0);setIndex((value)=>value+1);} else setPlaying(false); } },100); return()=>window.clearInterval(timer); },[playing,index,shot,shots.length]);
  useEffect(() => { if(!playing)return; videoRef.current?.play().catch(()=>undefined); audioRef.current?.play().catch(()=>undefined); },[index,playing]);

  function toggle(){ if(!shot)return; if(playing){videoRef.current?.pause();audioRef.current?.pause();setPlaying(false);} else setPlaying(true); }
  function selectShot(next:number){ setElapsed(0); setIndex(Math.min(shots.length-1,Math.max(0,next))); }
  function downloadManifest(){ if(!project)return; const timeline=shots.map((item,i)=>({order:i+1,start_seconds:shots.slice(0,i).reduce((sum,s)=>sum+s.duration_seconds,0),duration_seconds:item.duration_seconds,video:item.video_url??null,image:item.image_url??null,audio:item.audio_url??null,subtitle:item.dialogue??""})); const url=URL.createObjectURL(new Blob([JSON.stringify({project:{id:project.id,title:project.title},format:"9:16",timeline},null,2)],{type:"application/json"})); const a=document.createElement("a");a.href=url;a.download=`${project.title}-剪辑工程.json`;a.click();URL.revokeObjectURL(url); }

  if(error)return <main className="episode-page"><div className="episode-empty">{error}<Link href="/storyboard">返回分镜</Link></div></main>;
  if(!project||!shot)return <main className="episode-page"><div className="episode-empty">正在加载整集时间轴…</div></main>;
  return <main className="episode-page">
    <header className="admin-head"><Link className="wordmark" href="/"><span>影</span><b>影动 AI</b></Link><Link href="/storyboard">返回分镜</Link></header>
    <section className="episode-editor">
      <div className="episode-stage">
        <div className="episode-phone">{shot.video_url ? <video ref={videoRef} src={shot.video_url} muted playsInline/> : shot.image_url ? <Image src={shot.image_url} alt={shot.scene} fill unoptimized/> : <div className="episode-placeholder">镜头 {shot.shot_number}<small>{shot.scene}</small></div>}{shot.audio_url&&<audio ref={audioRef} src={shot.audio_url}/>} {shot.dialogue&&<div className="episode-subtitle">{shot.dialogue}</div>}</div>
        <div className="episode-controls"><button onClick={()=>selectShot(index-1)}>上一镜</button><button className="episode-play" onClick={toggle}>{playing?"暂停":"播放整集"}</button><button onClick={()=>selectShot(index+1)}>下一镜</button></div>
      </div>
      <div className="episode-panel"><p className="eyebrow">AUTO EDIT TIMELINE</p><h1>{project.title}</h1><p>视频、配音与字幕已按镜头顺序自动排列。</p><div className="episode-summary"><b>{shots.length} 镜</b><b>{total} 秒</b><b>{shots.filter(item=>item.video_url).length} 段视频</b><b>{shots.filter(item=>item.audio_url).length} 段配音</b></div><div className="episode-progress"><i style={{width:`${Math.min(100,(before+elapsed)/Math.max(total,1)*100)}%`}}/></div><div className="episode-timeline">{shots.map((item,i)=><button className={i===index?"active":""} key={item.id} onClick={()=>selectShot(i)} style={{flexGrow:item.duration_seconds}}><b>{String(item.shot_number).padStart(2,"0")}</b><small>{item.duration_seconds}s</small><span>{item.video_url?"视频":"图片"}{item.audio_url?" + 配音":""}</span></button>)}</div><button className="episode-export" onClick={downloadManifest}>导出剪辑工程 JSON</button><small className="episode-note">下一阶段将把此时间轴直接渲染为 MP4。</small></div>
    </section>
  </main>;
}
