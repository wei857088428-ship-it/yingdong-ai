import { productionSummary } from "./seriesProduction";

type ExportShot = {
  id: string;
  shot_number: number;
  duration_seconds: number;
  shot_type?: string;
  camera?: string;
  scene?: string;
  action?: string;
  dialogue?: string;
  sound?: string;
  image_prompt?: string;
  video_prompt?: string;
  image_url?: string;
  video_url?: string;
  audio_url?: string;
  voice_id?: string;
  voice_language?: string;
  subtitle_start_ms?: number;
  subtitle_end_ms?: number;
  media_status?: string;
  error_message?: string;
  character_ids?: string[] | null;
  character_names?: string[] | null;
  speaker_character_id?: string | null;
};

type ExportProject = {
  id: string;
  title: string;
  created_at: string;
  parent_project_id?: string | null;
  storyboard_shots: ExportShot[];
};

type ExportCharacter = {
  id: string;
  name: string;
  version: number;
  voice_id?: string;
  voice_language?: string;
  images?: Record<string, string | undefined>;
};

function srtTime(seconds: number) {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor(ms % 3_600_000 / 60_000);
  const secs = Math.floor(ms % 60_000 / 1000);
  return `${String(hours).padStart(2,"0")}:${String(minutes).padStart(2,"0")}:${String(secs).padStart(2,"0")},${String(ms % 1000).padStart(3,"0")}`;
}

export function episodeSrt(shots: ExportShot[]) {
  let offset = 0;
  let sequence = 1;
  const blocks: string[] = [];
  for (const shot of shots.toSorted((left,right) => left.shot_number-right.shot_number)) {
    const duration = Math.max(.1,Number(shot.duration_seconds) || 0);
    const localStart = Math.max(0,Math.min(duration,Number(shot.subtitle_start_ms ?? 0) / 1000));
    const declaredEnd = Number(shot.subtitle_end_ms ?? 0) / 1000;
    const localEnd = Math.max(localStart,Math.min(duration,declaredEnd > localStart ? declaredEnd : duration));
    if (shot.dialogue?.trim() && localEnd > localStart) blocks.push(`${sequence++}\n${srtTime(offset+localStart)} --> ${srtTime(offset+localEnd)}\n${shot.dialogue.trim()}`);
    offset += duration;
  }
  return blocks.length ? `${blocks.join("\n\n")}\n` : "";
}

export function buildSeriesExport(projects: ExportProject[],characters: ExportCharacter[],generatedAt = new Date().toISOString()) {
  const orderedProjects = projects.map((project,index) => {
    let offset = 0;
    const shots = project.storyboard_shots.toSorted((left,right) => left.shot_number-right.shot_number).map((shot) => {
      const startSeconds = offset;
      offset += Math.max(.1,Number(shot.duration_seconds) || 0);
      return { ...shot, timeline_start_seconds: startSeconds };
    });
    return { episode_number:index+1,id:project.id,title:project.title,created_at:project.created_at,parent_project_id:project.parent_project_id??null,duration_seconds:offset,production:productionSummary(project.storyboard_shots),srt:episodeSrt(project.storyboard_shots),shots };
  });
  const usedCharacterIds = new Set(orderedProjects.flatMap((project) => project.shots.flatMap((shot) => [...(shot.character_ids ?? []),...(shot.speaker_character_id ? [shot.speaker_character_id] : [])])));
  return { format:"yingdong-ai-series-v1",generated_at:generatedAt,series:{episodes:orderedProjects.length,duration_seconds:orderedProjects.reduce((sum,project) => sum+project.duration_seconds,0)},characters:characters.filter((character) => usedCharacterIds.has(character.id)),episodes:orderedProjects };
}

export function safeSeriesFilename(title: string) {
  return `${title.trim().replace(/[<>:"/\\|?*\u0000-\u001F]/g,"-").replace(/\s+/g," ").slice(0,80) || "影动AI连续剧"}-全季制作包.json`;
}
