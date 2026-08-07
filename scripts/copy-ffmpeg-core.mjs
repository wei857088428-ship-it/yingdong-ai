import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(root, "node_modules", "@ffmpeg", "core", "dist", "umd");
const target = join(root, "public", "render-engine");

await mkdir(target, { recursive: true });
await Promise.all([
  copyFile(join(source, "ffmpeg-core.js"), join(target, "engine")),
  copyFile(join(source, "ffmpeg-core.wasm"), join(target, "data")),
]);

console.log("Video render core copied to public/render-engine");
