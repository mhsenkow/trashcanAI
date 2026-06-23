// Copies the manifold3d Emscripten module + wasm into public/ so they can be
// loaded at runtime (outside the bundler). Runs automatically before dev/build.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules", "manifold-3d");
const pub = join(root, "public");

mkdirSync(pub, { recursive: true });
for (const file of ["manifold.wasm", "manifold.js"]) {
  copyFileSync(join(src, file), join(pub, file));
}
console.log("[copy-manifold] copied manifold.wasm + manifold.js → public/");
