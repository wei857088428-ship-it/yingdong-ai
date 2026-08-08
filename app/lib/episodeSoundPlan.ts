export type EpisodeSoundShot = {
  shot_number: number;
  duration_seconds: number;
  sound?: string;
};

export type EpisodeSoundCue = {
  shotIndex: number;
  shotNumber: number;
  query: string;
  startSeconds: number;
  durationSeconds: number;
};

const EVENT_SOUND = /爆炸|枪|炮|撞|碎|玻璃|门|敲|脚步|雷|雨|风|火|水|警报|铃|电话|车辆|引擎|刹车|剑|刀|拳|战斗|尖叫|呼吸|心跳|explosion|gun|impact|glass|door|knock|footstep|thunder|rain|wind|fire|water|alarm|bell|phone|engine|brake|sword|fight|scream|breath|heartbeat/i;
const SILENCE = /^(无|安静|静默|寂静|无音效|none|silence|no sound|background music|配乐|背景音乐|bgm)[。.!！ ]*$/i;

function cleanSound(value?: string) {
  return (value ?? "").replace(/\s+/g, " ").trim().slice(0, 180);
}

export function soundDescription(value?: string) {
  const raw = cleanSound(value);
  const labelled = raw.match(/(?:声音|环境声|动作音效|sound(?: effects?)?)\s*[:：]\s*([\s\S]*)$/i)?.[1];
  return cleanSound(labelled ?? raw);
}

export function soundOffsetSeconds(sound: string, durationSeconds: number) {
  const duration = Math.max(0, Number(durationSeconds) || 0);
  if (!duration) return 0;
  const explicit = sound.match(/(?:第\s*)?(\d+(?:\.\d+)?)\s*(?:秒(?:后|处|时)?|seconds?(?:\s+(?:later|in))?)/i)?.[1];
  if (explicit) return Math.min(Math.max(0, duration - 0.2), Math.max(0, Number(explicit)));
  if (/结尾|末尾|最后|临近结束|end of (?:the )?shot/i.test(sound)) return Math.max(0, duration - Math.min(0.8, duration * 0.2));
  if (/中段|中间|半途|半程|mid(?:dle)?(?: of (?:the )?shot)?/i.test(sound)) return duration * 0.5;
  return 0;
}

export function episodeSoundCues(shots: EpisodeSoundShot[], limit = 6): EpisodeSoundCue[] {
  let cursor = 0;
  const seen = new Set<string>();
  const candidates: Array<EpisodeSoundCue & { score: number }> = [];

  shots.forEach((shot, shotIndex) => {
    const sound = soundDescription(shot.sound);
    const duration = Math.max(0, Number(shot.duration_seconds) || 0);
    const offset = soundOffsetSeconds(sound, duration);
    const normalized = sound.toLocaleLowerCase();
    if (sound.length >= 2 && !SILENCE.test(sound) && !seen.has(normalized)) {
      seen.add(normalized);
      candidates.push({
        shotIndex,
        shotNumber: shot.shot_number,
        query: `cinematic sound effect only, no music: ${sound}`,
        startSeconds: cursor + offset,
        durationSeconds: Math.max(0.2, Math.min(2.4, duration - offset)),
        score: EVENT_SOUND.test(sound) ? 2 : 1,
      });
    }
    cursor += duration;
  });

  return candidates
    .sort((a, b) => b.score - a.score || a.shotIndex - b.shotIndex)
    .slice(0, Math.max(0, limit))
    .sort((a, b) => a.shotIndex - b.shotIndex)
    .map((cue) => ({
      shotIndex: cue.shotIndex,
      shotNumber: cue.shotNumber,
      query: cue.query,
      startSeconds: cue.startSeconds,
      durationSeconds: cue.durationSeconds,
    }));
}

export function soundEffectFilter(inputIndex: number, cue: EpisodeSoundCue, label: string) {
  const duration = Math.max(0.2, cue.durationSeconds);
  const fadeStart = Math.max(0, duration - 0.18).toFixed(3);
  const delay = Math.max(0, Math.round(cue.startSeconds * 1000));
  return `[${inputIndex}:a]atrim=0:${duration.toFixed(3)},asetpts=PTS-STARTPTS,aresample=44100,volume=.28,afade=t=out:st=${fadeStart}:d=.18,adelay=${delay}|${delay}[${label}]`;
}
