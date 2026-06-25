// Signed-distance helpers for optional SDF export. Preview + STL use Manifold booleans.
// Hollow = open-topped outer rounded box minus inner cavity (constant wall thickness in XY).

import { perimeterLength, perimeterParam } from "../geometry/profile";
import { createNoise3D } from "simplex-noise";
import type { SdfSceneState } from "./state";
import { draftOnlyGrow } from "./wallProfile";

const smoothstep = (e0: number, e1: number, x: number): number => {
  if (e1 <= e0) return x < e0 ? 0 : 1;
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

export function sdExtrudedRoundRect(
  x: number,
  y: number,
  z: number,
  halfL: number,
  halfW: number,
  cr: number,
  zCenter: number,
  halfH: number,
): number {
  const px = Math.abs(x) - halfL + cr;
  const py = Math.abs(y) - halfW + cr;
  const d2 =
    Math.hypot(Math.max(px, 0), Math.max(py, 0)) +
    Math.min(Math.max(px, py), 0) -
    cr;
  const dz = Math.abs(z - zCenter) - halfH;
  return Math.hypot(Math.max(d2, 0), Math.max(dz, 0)) + Math.min(Math.max(d2, dz), 0);
}

function outerHalfExtents(z: number, st: SdfSceneState) {
  const zg = Math.max(0, z);
  const dr = draftOnlyGrow(zg, st.H, st.draftTan);
  return {
    hl: st.halfL + dr,
    hw: st.halfW + dr,
    cr: Math.max(0.1, st.r + dr),
  };
}

function innerHalfExtents(z: number, st: SdfSceneState) {
  const cavityBase = st.cavityCenterZ - st.cavityHalfH;
  const zg = Math.max(0, z - cavityBase);
  const dr = draftOnlyGrow(zg, st.H - cavityBase, st.draftTan);
  return {
    hl: st.innerHalfL + dr,
    hw: st.innerHalfW + dr,
    cr: Math.max(0.1, st.innerR + dr),
  };
}

function sdOpenRoundColumn(
  x: number,
  y: number,
  z: number,
  hl: number,
  hw: number,
  cr: number,
  H: number,
): number {
  const px = Math.abs(x) - hl + cr;
  const py = Math.abs(y) - hw + cr;
  const d2 =
    Math.hypot(Math.max(px, 0), Math.max(py, 0)) +
    Math.min(Math.max(px, py), 0) -
    cr;
  if (z > H) return Math.max(d2, z - H);
  return Math.max(d2, -z);
}

export function shellOuterDistance(
  x: number,
  y: number,
  z: number,
  st: SdfSceneState,
): number {
  const { hl, hw, cr } = outerHalfExtents(z, st);
  return sdOpenRoundColumn(x, y, z, hl, hw, cr, st.H);
}

export function cavityDistance(x: number, y: number, z: number, st: SdfSceneState): number {
  const { hl, hw, cr } = innerHalfExtents(z, st);
  return sdExtrudedRoundRect(
    x,
    y,
    z,
    hl,
    hw,
    cr,
    st.cavityCenterZ,
    st.cavityHalfH + 0.5,
  );
}

// --- Surfacing field (visual only; not subtracted from SDF distance) ---

const TWO_PI = Math.PI * 2;
const SQRT3_2 = 0.8660254037844386;

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const noise3D = createNoise3D(mulberry32(1337));

export function surfacingField(
  x: number,
  y: number,
  z: number,
  s: number,
  st: SdfSceneState,
): number {
  let u = s / st.sPitch;
  let v = z / st.zPitch;
  if (st.distortion > 0) {
    const a = st.distortion * 1.4;
    const f = 0.06;
    u += a * noise3D(x * f, y * f, z * f);
    v += a * noise3D(x * f + 31.7, y * f + 5.2, z * f + 19.3);
  }
  switch (st.surfacing) {
    case "ribbing":
      return st.ribOrientation === 0
        ? 0.5 - 0.5 * Math.cos(TWO_PI * u)
        : 0.5 - 0.5 * Math.cos(TWO_PI * v);
    case "knurling":
      return (1 - 2 * Math.abs((u + v) % 1 - 0.5)) * (1 - 2 * Math.abs((u - v) % 1 - 0.5));
    case "noise":
      return 0.5 + 0.5 * noise3D(x / st.pitch, y / st.pitch, z / st.pitch);
    case "hex": {
      const a1 = Math.cos(TWO_PI * u);
      const a2 = Math.cos(TWO_PI * (0.5 * u + SQRT3_2 * v));
      const a3 = Math.cos(TWO_PI * (0.5 * u - SQRT3_2 * v));
      return (a1 + a2 + a3 + 1.5) / 4.5;
    }
    default:
      return 0;
  }
}

export function exteriorDisplacement(
  x: number,
  y: number,
  z: number,
  st: SdfSceneState,
): number {
  const { hl, hw, cr } = outerHalfExtents(z, st);
  const bottomQuiet = st.edgeSize > 0 ? st.edgeSize : 0;
  const bottomFadeEnd = bottomQuiet + st.taperBand;
  const band =
    z > bottomQuiet
      ? Math.min(
          smoothstep(bottomQuiet, bottomFadeEnd, z),
          1 - smoothstep(st.H - st.taperBand, st.H, z),
        )
      : 0;
  if (band <= 0 || st.amplitude <= 0 || st.surfacing === "smooth") return 0;
  const s = perimeterParam(x, y, hl, hw, cr);
  const raw = Math.min(1, Math.max(0, surfacingField(x, y, z, s, st)));
  const w = 0.46 * (1 - st.sharpness) + 0.03;
  const c = smoothstep(0.5 - w, 0.5 + w, raw);
  return st.amplitude * c * band;
}

export function wallMask(x: number, y: number, z: number, st: SdfSceneState): number {
  const { hl, hw, cr } = outerHalfExtents(z, st);
  const ax = hl - cr;
  const ay = hw - cr;
  if (z <= 0.01 || z >= st.H - 0.01) {
    return Math.abs(x) < ax - 0.5 && Math.abs(y) < ay - 0.5 ? 0 : 1;
  }
  return 1;
}

// Re-export for march bounds
export { perimeterLength };
