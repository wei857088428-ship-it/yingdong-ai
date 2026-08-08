export function sceneIdentity(value?: string) {
  return String(value ?? "").toLocaleLowerCase("zh-CN").split(/[，。；：,;:|｜]/).slice(0, 2).map((part) => part.replace(/[\s_\-—]/g, "")).filter(Boolean).join("|");
}

export function isSceneBoundary(left?: string, right?: string) {
  const a = sceneIdentity(left);
  const b = sceneIdentity(right);
  return Boolean(a && b && a !== b);
}

export function episodeVideoFades(scenes: string[], index: number, durationSeconds: number) {
  const first = index === 0;
  const last = index === scenes.length - 1;
  const fadeIn = first ? 0.12 : isSceneBoundary(scenes[index - 1], scenes[index]) ? 0.18 : 0;
  const fadeOut = last ? 0.12 : isSceneBoundary(scenes[index], scenes[index + 1]) ? 0.18 : 0;
  return `${fadeIn ? `,fade=t=in:st=0:d=${fadeIn.toFixed(2)}` : ""}${fadeOut ? `,fade=t=out:st=${Math.max(0, durationSeconds - fadeOut).toFixed(3)}:d=${fadeOut.toFixed(2)}` : ""}`;
}
