import { flatPerformanceRun } from "./performanceArc";
import { hasPerformanceDirection } from "./performanceDirection";

type AuditShot = {
  id: string;
  shot_number: number;
  duration_seconds: number;
  dialogue?: string;
  sound?: string;
  image_url?: string;
  video_url?: string;
  audio_url?: string;
  voice_id?: string;
  media_status?: string;
  error_message?: string;
  character_ids?: string[] | null;
  character_names?: string[] | null;
  speaker_character_id?: string | null;
};

type AuditProject = { id:string; title:string; parent_project_id?:string|null; storyboard_shots:AuditShot[] };
type AuditCharacter = { id:string; name:string; voice_id?:string; images?:Record<string,string|undefined> };
export type SeriesQualityFinding = { level:"critical"|"warning"; code:string; message:string; projectId?:string; episodeNumber?:number; shotNumber?:number };
export type SeriesQualityReport = { score:number; passed:boolean; criticalCount:number; warningCount:number; findings:SeriesQualityFinding[]; auditedEpisodes:number; auditedShots:number };

export function auditSeriesQuality(projects:AuditProject[],characters:AuditCharacter[]):SeriesQualityReport {
  const findings:SeriesQualityFinding[]=[];
  const add=(finding:SeriesQualityFinding)=>findings.push(finding);
  const charactersById=new Map(characters.map((character)=>[character.id,character]));
  const charactersByName=new Map(characters.map((character)=>[character.name.trim().toLocaleLowerCase("zh-CN"),character]));
  const checkedCharacters=new Set<string>();
  const voicesBySpeaker=new Map<string,Set<string>>();

  projects.forEach((project,episodeIndex)=>{
    const episodeNumber=episodeIndex+1;
    if(episodeIndex>0&&project.parent_project_id!==projects[episodeIndex-1].id)add({level:"critical",code:"broken_episode_chain",message:`第 ${episodeNumber} 集没有承接上一集，连续剧链已断开`,projectId:project.id,episodeNumber});
    if(!project.storyboard_shots.length)add({level:"critical",code:"empty_episode",message:`第 ${episodeNumber} 集没有分镜`,projectId:project.id,episodeNumber});
    const ordered=project.storyboard_shots.toSorted((left,right)=>left.shot_number-right.shot_number);
    const flat=flatPerformanceRun(ordered.map((shot)=>({dialogue:shot.dialogue,performance:shot.sound,speakerKey:shot.speaker_character_id})));
    if(flat)add({level:"warning",code:"flat_performance_arc",message:`第 ${episodeNumber} 集同一说话角色连续至少 3 段使用相同情绪、强度、语速和音量`,projectId:project.id,episodeNumber});
    ordered.forEach((shot)=>{
      const location={projectId:project.id,episodeNumber,shotNumber:shot.shot_number};
      if(!Number.isFinite(shot.duration_seconds)||shot.duration_seconds<=0)add({level:"critical",code:"invalid_duration",message:`第 ${episodeNumber} 集镜头 ${shot.shot_number} 时长无效`,...location});
      if(shot.media_status==="failed"||shot.error_message?.trim())add({level:"critical",code:"failed_task",message:`第 ${episodeNumber} 集镜头 ${shot.shot_number} 有失败任务：${shot.error_message?.trim()||"生成失败"}`,...location});
      if(!shot.image_url)add({level:"critical",code:"missing_image",message:`第 ${episodeNumber} 集镜头 ${shot.shot_number} 缺少角色画面`,...location});
      if(!shot.video_url)add({level:"critical",code:"missing_video",message:`第 ${episodeNumber} 集镜头 ${shot.shot_number} 缺少视频`,...location});
      if(shot.dialogue?.trim()){
        if(!shot.speaker_character_id)add({level:"warning",code:"missing_speaker",message:`第 ${episodeNumber} 集镜头 ${shot.shot_number} 有对白但未指定说话角色`,...location});
        if(!hasPerformanceDirection(shot.sound))add({level:"warning",code:"missing_performance",message:`第 ${episodeNumber} 集镜头 ${shot.shot_number} 缺少完整情绪、强度、语速或音量指令`,...location});
        if(!shot.audio_url)add({level:"critical",code:"missing_voice",message:`第 ${episodeNumber} 集镜头 ${shot.shot_number} 缺少配音`,...location});
        if(shot.speaker_character_id&&shot.video_url&&shot.audio_url&&shot.media_status!=="lipsync_ready"&&!/heygen/i.test(shot.video_url))add({level:"critical",code:"missing_lipsync",message:`第 ${episodeNumber} 集镜头 ${shot.shot_number} 的声音和口型未同步`,...location});
      }
      if(shot.speaker_character_id&&shot.voice_id){const voices=voicesBySpeaker.get(shot.speaker_character_id)??new Set<string>();voices.add(shot.voice_id);voicesBySpeaker.set(shot.speaker_character_id,voices);const speaker=charactersById.get(shot.speaker_character_id);if(speaker?.voice_id&&speaker.voice_id!==shot.voice_id)add({level:shot.audio_url?"critical":"warning",code:"character_voice_mismatch",message:`第 ${episodeNumber} 集镜头 ${shot.shot_number} 的音色 ${shot.voice_id} 与角色「${speaker.name}」固定音色 ${speaker.voice_id} 不一致`,...location});}
      for(const characterId of shot.character_ids??[]){
        if(checkedCharacters.has(characterId))continue;checkedCharacters.add(characterId);const character=charactersById.get(characterId);
        if(!character){add({level:"critical",code:"missing_character",message:`第 ${episodeNumber} 集使用了不存在的角色档案`,...location});continue;}
        const references=Object.values(character.images??{}).filter(Boolean).length;
        if(references<2)add({level:"warning",code:"weak_identity_reference",message:`角色「${character.name}」只有 ${references}/4 张参考图，跨镜头外貌可能不稳定`,...location});
        if(!character.voice_id)add({level:"warning",code:"missing_character_voice",message:`角色「${character.name}」没有固定音色`,...location});
      }
      for(const name of shot.character_names??[]){const key=name.trim().toLocaleLowerCase("zh-CN");const character=charactersByName.get(key);if(key&&!character)add({level:"critical",code:"uncreated_character",message:`第 ${episodeNumber} 集镜头 ${shot.shot_number} 的角色「${name}」尚未创建角色档案`,...location});else if(character&&!(shot.character_ids??[]).includes(character.id))add({level:"critical",code:"unbound_character",message:`第 ${episodeNumber} 集镜头 ${shot.shot_number} 的角色「${name}」没有绑定到统一角色档案`,...location});}
    });
  });
  for(const [speakerId,voices] of voicesBySpeaker){if(voices.size>1){const character=charactersById.get(speakerId);add({level:"warning",code:"voice_drift",message:`角色「${character?.name||speakerId}」在全季使用了 ${voices.size} 种音色，声音一致性不足`});}}
  const criticalCount=findings.filter((finding)=>finding.level==="critical").length;
  const warningCount=findings.length-criticalCount;
  const score=Math.max(0,100-criticalCount*8-warningCount*3);
  return {score,passed:criticalCount===0&&warningCount===0,criticalCount,warningCount,findings,auditedEpisodes:projects.length,auditedShots:projects.reduce((sum,project)=>sum+project.storyboard_shots.length,0)};
}
