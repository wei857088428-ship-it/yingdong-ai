type EpisodeAudioSource = { audio_url?: string; source_video_url?: string | null };

export function episodeAudioPlan(item: EpisodeAudioSource, embedded: boolean, audioName: string, ambientName: string, duration: string) {
  const separateVoice = Boolean(item.audio_url && !embedded);
  const sourceAmbience = Boolean(item.source_video_url && embedded);
  const embeddedMix = Boolean(item.audio_url && sourceAmbience);
  const embeddedVoiceOnly = Boolean(item.audio_url && embedded && !sourceAmbience);
  const reliableVoice = Boolean(item.audio_url);
  const audioArgs = separateVoice || embeddedVoiceOnly
    ? ["-i", audioName]
    : embeddedMix
      ? ["-i", ambientName, "-i", audioName]
      : sourceAmbience
        ? ["-i", ambientName]
        : ["-f", "lavfi", "-t", duration, "-i", "anullsrc=channel_layout=stereo:sample_rate=44100"];

  function mixedAudio(baseVoiceFilter: string, audioFades: string) {
    if (embeddedVoiceOnly) return `[1:a]${baseVoiceFilter}${audioFades}[a]`;
    if (separateVoice) return `[0:a]volume=.18,aresample=44100,apad[amb];[1:a]${baseVoiceFilter}[voice];[amb][voice]amix=inputs=2:duration=longest:dropout_transition=0${audioFades}[a]`;
    if (embeddedMix) return `[2:a]${baseVoiceFilter}[voice];[1:a]volume=.16,aresample=44100,apad[amb];[voice][amb]amix=inputs=2:duration=longest:dropout_transition=0${audioFades}[a]`;
    if (sourceAmbience) return `[0:a]volume=.95,aresample=44100,apad[voice];[1:a]volume=.16,aresample=44100,apad[amb];[voice][amb]amix=inputs=2:duration=longest:dropout_transition=0${audioFades}[a]`;
    return `[0:a]volume=.85,aresample=44100,apad${audioFades}[a]`;
  }

  return { separateVoice, sourceAmbience, embeddedMix, reliableVoice, audioArgs, subtitleInputOffset: embeddedMix ? 3 : 2, fallbackAudio: embeddedMix ? "2:a" : "1:a", mixedAudio };
}
