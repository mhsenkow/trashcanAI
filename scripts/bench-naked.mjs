import Module from "manifold-3d/manifold.js";
import { generate } from "../src/lib/geometry/engine.ts";
import { DEFAULT_PARAMS } from "../src/lib/types.ts";

const wasm = await Module();
wasm.setup();

for (const surf of ["smooth", "hex", "knurling", "cells"]) {
  const g = generate(wasm, { ...DEFAULT_PARAMS, surfacing: surf }, { quality: "preview" });
  console.log(
    surf,
    "valid",
    g.stats.watertight,
    "rim",
    g.stats.rimEdges,
    "defect",
    g.stats.defectEdges,
    "tris",
    g.stats.bodyTriangles,
  );
}
