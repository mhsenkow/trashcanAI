import Module from "manifold-3d/manifold.js";
import { generate } from "../src/lib/geometry/engine.ts";
import { rightEdgeXNearZ } from "../src/lib/geometry/meshAnalysis.ts";
import { DEFAULT_PARAMS } from "../src/lib/types.ts";

const variant = process.argv[2] ?? "default";
const overrides =
  variant === "smooth0"
    ? { smoothing: 0 }
    : variant === "fillet0"
      ? { baseEdgeType: "none", baseEdgeSize: 0 }
      : variant === "fillet2"
        ? { baseEdgeType: "fillet", baseEdgeSize: 2 }
        : {};

const wasm = await Module();
wasm.setup();
const g = generate(wasm, { ...DEFAULT_PARAMS, ...overrides });
const halfL = DEFAULT_PARAMS.length / 2;
console.log(
  `${variant} halfL=${halfL} baseEdge=${overrides.baseEdgeType ?? DEFAULT_PARAMS.baseEdgeType}@${overrides.baseEdgeSize ?? DEFAULT_PARAMS.baseEdgeSize}`,
);
for (const z of [0, 1, 2, 3, 4, 5, 6, 8, 10]) {
  const x = rightEdgeXNearZ(g.body.positions, z);
  console.log(`  z=${z.toFixed(0)} edgeX=${x.toFixed(2)} (Δnom=${(x - halfL).toFixed(2)})`);
}
