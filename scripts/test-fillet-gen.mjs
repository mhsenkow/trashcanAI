import Module from "manifold-3d/manifold.js";
import { generate } from "../src/lib/geometry/engine.ts";
import { DEFAULT_PARAMS } from "../src/lib/types.ts";

const wasm = await Module();
wasm.setup();

const params = {
  ...DEFAULT_PARAMS,
  baseEdgeType: "fillet",
  baseEdgeSize: 0.8,
  surfacing: "smooth",
  amplitude: 0,
  flangeWidth: 40,
};

const g = generate(wasm, params, { quality: "preview" });
console.log(
  "fillet preview",
  "valid",
  g.stats.watertight,
  "defect",
  g.stats.defectEdges,
  "rim",
  g.stats.rimEdges,
);
