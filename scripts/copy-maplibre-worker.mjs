import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "node_modules/maplibre-gl/dist");
const pub = join(root, "public");

mkdirSync(pub, { recursive: true });

for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  const src = join(dist, file);
  if (!existsSync(src)) {
    console.warn(`[copy-maplibre-worker] skip missing ${file}`);
    continue;
  }
  copyFileSync(src, join(pub, file));
}
