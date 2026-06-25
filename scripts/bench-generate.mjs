import Module from "manifold-3d/manifold.js";
import { generate } from "../src/lib/geometry/engine.ts";
import { DEFAULT_PARAMS } from "../src/lib/types.ts";

const wasm = await Module();
wasm.setup();

for (const [label, quality] of [
  ["preview", "preview"],
  ["full", "full"],
]) {
  const t0 = performance.now();
  const g = generate(wasm, DEFAULT_PARAMS, { quality });
  console.log(
    label,
    `${(performance.now() - t0).toFixed(0)}ms`,
    "tris",
    g.stats.bodyTriangles,
  );
}
