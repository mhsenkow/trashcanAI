import Module from "manifold-3d/manifold.js";
import { readFileSync } from "fs";
import { pathToFileURL } from "url";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

// Minimal DEFAULT_PARAMS inline to avoid TS import
const params = {
  length: 265,
  width: 190,
  height: 150,
  cornerRadius: 4,
  wallThickness: 1,
  floorThickness: 1,
  wallDraft: 2,
  baseEdgeType: "none",
  baseEdgeSize: 0,
  flangeWidth: 40,
  flangeThickness: 1,
  surfacing: "ribbing",
  featureScale: 2.5,
  amplitude: 0.35,
  sharpness: 0.55,
  ribOrientation: "vertical",
  distortion: 0,
  smoothing: 2,
  includeLid: true,
  lidClearance: 0.15,
  lidLipHeight: 4,
};

const t0 = performance.now();
const wasm = await Module();
wasm.setup();
console.log("wasm", (performance.now() - t0).toFixed(0) + "ms");

// Dynamic import of compiled engine won't work without tsx. Use worker path test instead.
console.log("params ok, wasm ready");
