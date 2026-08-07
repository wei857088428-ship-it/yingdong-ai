import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(root, "node_modules", "@ffmpeg", "core", "dist", "umd");
const target = join(root, "public", "ffmpeg");

await mkdir(target, { recursive: true });
await Promise.all([
  copyFile(join(source, "ffmpeg-core.js"), join(target, "ffmpeg-core.js")),
  copyFile(join(source, "ffmpeg-core.wasm"), join(target, "ffmpeg-core.wasm")),
]);

console.log("FFmpeg core copied to public/ffmpeg");
