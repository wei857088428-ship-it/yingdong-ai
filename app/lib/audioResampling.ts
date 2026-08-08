export function resampleMonoPcm16(channels: Float32Array[], sourceRate: number, targetRate: number, outputFrames: number) {
  if (!channels.length || !Number.isFinite(sourceRate) || sourceRate <= 0 || !Number.isFinite(targetRate) || targetRate <= 0 || outputFrames < 0) throw new Error("音频重采样参数无效");
  const samples = new Int16Array(outputFrames);
  const sourceLength = Math.min(...channels.map((channel) => channel.length));
  for (let frame = 0; frame < outputFrames; frame++) {
    const position = frame * sourceRate / targetRate;
    if (position >= sourceLength) continue;
    const left = Math.floor(position);
    const right = Math.min(sourceLength - 1, left + 1);
    const fraction = position - left;
    let sample = 0;
    for (const channel of channels) sample += channel[left] + (channel[right] - channel[left]) * fraction;
    sample = Math.max(-1, Math.min(1, sample / channels.length));
    samples[frame] = Math.round(sample < 0 ? sample * 0x8000 : sample * 0x7fff);
  }
  return samples;
}
