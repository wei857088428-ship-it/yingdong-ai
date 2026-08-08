type EffectMix = { filter: string; label: string };

export function episodeMixFilters(musicInputIndex: number | null, totalSeconds: number, effects: EffectMix[], dynamicDucking = true) {
  const hasDucking = musicInputIndex !== null && dynamicDucking;
  const filters = [hasDucking ? "[0:a]aresample=44100,asplit=2[dialogue][dialoguekey]" : "[0:a]aresample=44100[dialogue]"];
  const mixLabels = ["[dialogue]"];
  if (musicInputIndex !== null) {
    const fadeOut = Math.max(0, totalSeconds - 1).toFixed(3);
    if (hasDucking) {
      filters.push(`[${musicInputIndex}:a]volume=.12,afade=t=in:st=0:d=.8,afade=t=out:st=${fadeOut}:d=1[musicraw]`);
      filters.push("[musicraw][dialoguekey]sidechaincompress=threshold=.02:ratio=10:attack=15:release=350:knee=3[duckedmusic]");
      mixLabels.push("[duckedmusic]");
    } else {
      filters.push(`[${musicInputIndex}:a]volume=.08,afade=t=in:st=0:d=.8,afade=t=out:st=${fadeOut}:d=1[music]`);
      mixLabels.push("[music]");
    }
  }
  for (const effect of effects) { filters.push(effect.filter); mixLabels.push(`[${effect.label}]`); }
  filters.push(`${mixLabels.join("")}amix=inputs=${mixLabels.length}:duration=first:dropout_transition=0,alimiter=limit=.95[a]`);
  return filters;
}
