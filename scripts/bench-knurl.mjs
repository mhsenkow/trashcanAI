import Module from "manifold-3d/manifold.js";
import { generate } from "../src/lib/geometry/engine.ts";
import { DEFAULT_PARAMS } from "../src/lib/types.ts";

const wasm = await Module();
wasm.setup();

const params = { ...DEFAULT_PARAMS, surfacing: "knurling" };

for (const quality of ["preview", "full"]) {
  const t0 = performance.now();
  const g = generate(wasm, params, { quality });
  console.log(
    quality,
    `${(performance.now() - t0).toFixed(0)}ms`,
    "tris",
    g.stats.bodyTriangles,
    "naked",
    g.stats.nakedEdges,
    "watertight",
    g.stats.watertight,
    "smoothClamped",
    g.stats.smoothingClamped,
  );
}

const g2 = generate(wasm, { ...params, smoothing: 2 }, { quality: "full" });
console.log(
  "full+smooth2",
  "naked",
  g2.stats.nakedEdges,
  "tris",
  g2.stats.bodyTriangles,
  "smoothClamped",
  g2.stats.smoothingClamped,
);
