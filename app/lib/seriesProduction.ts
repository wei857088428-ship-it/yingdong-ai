type ProductionShot = {
  dialogue?: string;
  speaker_character_id?: string | null;
  image_url?: string;
  video_url?: string;
  audio_url?: string;
  media_status?: string;
  error_message?: string;
};

export function shotProductionComplete(shot: ProductionShot) {
  const hasDialogue = Boolean(shot.dialogue?.trim());
  const needsLipSync = hasDialogue && Boolean(shot.speaker_character_id);
  const lipSynced = shot.media_status === "lipsync_ready" || /heygen/i.test(shot.video_url || "");
  return Boolean(shot.image_url && shot.video_url && (!hasDialogue || shot.audio_url) && (!needsLipSync || lipSynced));
}

export function productionSummary(shots: ProductionShot[]) {
  const complete = shots.filter(shotProductionComplete).length;
  const failed = shots.filter((shot) => shot.media_status === "failed" || Boolean(shot.error_message?.trim())).length;
  const total = shots.length;
  return {
    total,
    complete,
    incomplete: total - complete,
    failed,
    percent: total ? Math.round(complete / total * 100) : 0,
  };
}

export function seriesProductionSummary(projects: Array<{ storyboard_shots: ProductionShot[] }>) {
  const summary = productionSummary(projects.flatMap((project) => project.storyboard_shots));
  return { ...summary, episodes: projects.length, completedEpisodes: projects.filter((project) => productionSummary(project.storyboard_shots).incomplete === 0 && project.storyboard_shots.length > 0).length };
}
