import { edgeRadialOffset } from "../src/lib/sdf/wallProfile.ts";

for (const zg of [0, 0.5, 1, 1.5, 2, 3]) {
  console.log("zg", zg, "fillet dr", edgeRadialOffset(zg, "fillet", 2).toFixed(3));
}
