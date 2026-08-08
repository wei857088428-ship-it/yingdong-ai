type EstimateShot = {
  duration_seconds: number;
  shot_type?: string;
  sound?: string;
  action?: string;
  dialogue?: string;
  speaker_character_id?: string | null;
  image_url?: string;
  video_url?: string;
  audio_url?: string;
  media_status?: string;
};

export function estimateProductionCost(shots: EstimateShot[],resolution: "480p"|"720p") {
  const needsLipSync = (shot: EstimateShot) => Boolean(shot.dialogue?.trim() && shot.speaker_character_id && shot.media_status !== "lipsync_ready" && !/heygen/i.test(shot.video_url || ""));
  const imageCount = shots.filter((shot) => !shot.image_url).length;
  const videoShots = shots.filter((shot) => !shot.video_url);
  const voiceCount = shots.filter((shot) => shot.dialogue?.trim() && !shot.audio_url).length;
  const lipSyncShots = shots.filter(needsLipSync);
  const videoCreditCost = resolution === "720p" ? 112 : 80;
  return {
    imageCount,
    videoCount: videoShots.length,
    voiceCount,
    lipSyncCount: lipSyncShots.length,
    credits: imageCount * 20 + videoShots.length * videoCreditCost + voiceCount * 2,
    xaiUsd: videoShots.reduce((sum,shot) => sum + Math.min(15,Math.max(0,shot.duration_seconds)) * (resolution === "720p" ? .07 : .05),0),
    heygenUsd: lipSyncShots.reduce((sum,shot) => {
      const distant = /远景|全景|空镜/.test(shot.shot_type || "");
      const intense = /强度\s*[:：]?\s*[4-5]|大喊|哭|愤怒|惊恐/.test(`${shot.sound || ""} ${shot.action || ""}`);
      return sum + Math.max(0,shot.duration_seconds) * (!distant || intense ? .0667 : .0333);
    },0),
  };
}
