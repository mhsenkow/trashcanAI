// Algorithmic surfacing + form shaping — the warp callback for manifold's
// `warpBatch`.
//
// Two things are applied as displacements along the exterior normal:
//   1. A profile offset = wall draft (taper) plus a bottom fillet that tucks
//      inward at the base. Applied to side walls and cap perimeters so the mesh
//      stays closed.
//   2. The algorithmic finish, pushed *outward only* on the exterior wall, faded
//      to zero in a band near the top/bottom so the rim and base stay clean.
//
// Each finish produces a field in [0,1] over the unrolled wall coordinates
// (u = around, v = up); Sharpness then contrasts it and Distortion domain-warps it.

import { createNoise3D } from "simplex-noise";
import { clampRadius, outwardNormal, perimeterLength, perimeterParam } from "./profile";
import type { RibOrientation, SurfacingType } from "../types";

const WALL_EPS = 1e-3;

/**
 * Extruded caps are fan-triangulated from an interior pole. Only perimeter
 * vertices are true side walls — moving interior cap verts breaks the mesh.
 */
function isShellWallVertex(
  x: number,
  y: number,
  z: number,
  halfL: number,
  halfW: number,
  r: number,
  zMin: number,
  zMax: number,
): boolean {
  const cr = clampRadius(halfL, halfW, r);
  const ax = halfL - cr;
  const ay = halfW - cr;
  if (z > zMin + WALL_EPS && z < zMax - WALL_EPS) return true;
  const inCapInterior = Math.abs(x) < ax - WALL_EPS && Math.abs(y) < ay - WALL_EPS;
  return !inCapInterior;
}

// Deterministic PRNG so noise/cells are identical across regenerations (stable STLs).
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SurfacingConfig {
  type: SurfacingType;
  amplitude: number; // mm, already clamped against self-intersection
  pitch: number; // mm
  orientation: RibOrientation;
  sharpness: number; // 0..1
  distortion: number; // 0..1
}

export interface WarpContext {
  halfL: number;
  halfW: number;
  r: number;
  zMin: number;
  zMax: number;
  taperBand: number;
  /** tan(draft angle): radial outward offset per mm above this part's base (zMin). */
  draftTan?: number;
  /** Bottom fillet radius (mm), measured from this part's base (zMin). */
  bottomFillet?: number;
}

const TWO_PI = Math.PI * 2;
const SQRT3_2 = 0.8660254037844386;

function smoothstep(e0: number, e1: number, x: number): number {
  if (e1 <= e0) return x < e0 ? 0 : 1;
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

const fract = (x: number) => x - Math.floor(x);
const wrapInt = (i: number, n: number) => ((i % n) + n) % n;
const tri = (x: number) => 1 - 2 * Math.abs(fract(x) - 0.5);
const bar = (t: number) => {
  const d = Math.abs(fract(t) - 0.5) * 2;
  return 1 - d * d;
};

export type WarpFn = (verts: Float64Array, count: number) => void;

/**
 * Build the in-place warp callback for a part spanning [zMin, zMax].
 */
export function makeWarp(cfg: SurfacingConfig, ctx: WarpContext): WarpFn {
  const { type, amplitude, pitch, orientation, sharpness, distortion } = cfg;
  const { halfL, halfW, r, zMin, zMax, taperBand } = ctx;
  const draftTan = ctx.draftTan ?? 0;
  const bottomFillet = ctx.bottomFillet ?? 0;

  const hasSurfacing = type !== "smooth" && amplitude > 0;
  const hasProfile = draftTan !== 0 || bottomFillet > 0;
  if (!hasSurfacing && !hasProfile) return () => {};

  // Quarter-round tuck at the base: max inset at zMin, blends to nominal at zMin+r.
  // Draft taper continues above the fillet band (both are 0 at the junction).
  // Surfacing stays off through the entire fillet band so ribs cannot bulge past
  // the tucked base and create a visible seam.
  const profileOffset = (x: number, y: number, z: number): number => {
    if (!isShellWallVertex(x, y, z, halfL, halfW, r, zMin, zMax)) return 0;
    const zb = z - zMin;

    if (bottomFillet > 0 && zb >= 0 && zb <= bottomFillet + WALL_EPS) {
      const t = bottomFillet - Math.min(zb, bottomFillet);
      return -(bottomFillet - Math.sqrt(Math.max(0, bottomFillet * bottomFillet - t * t)));
    }

    if (draftTan !== 0 && zb > bottomFillet + WALL_EPS) {
      return (zb - bottomFillet) * draftTan;
    }

    return 0;
  };

  /** Cap fans leave an interior pole; shrink the flat cap disk with the tucked rim. */
  const applyBottomCapShrink = (
    verts: Float64Array,
    o: number,
    x: number,
    y: number,
    z: number,
  ): boolean => {
    if (bottomFillet <= 0 || z > zMin + WALL_EPS) return false;
    const cr = clampRadius(halfL, halfW, r);
    const ax = halfL - cr;
    const ay = halfW - cr;
    if (Math.abs(x) >= ax - WALL_EPS || Math.abs(y) >= ay - WALL_EPS) return false;
    const sx = Math.max(0.05, (halfL - bottomFillet) / halfL);
    const sy = Math.max(0.05, (halfW - bottomFillet) / halfW);
    verts[o] = x * sx;
    verts[o + 1] = y * sy;
    return true;
  };

  // Profile-only warp (e.g. the smooth interior cavity).
  if (!hasSurfacing) {
    return function warp(verts: Float64Array, count: number) {
      for (let i = 0; i < count; i++) {
        const o = i * 3;
        const x = verts[o];
        const y = verts[o + 1];
        const z = verts[o + 2];
        if (applyBottomCapShrink(verts, o, x, y, z)) continue;
        const d = profileOffset(x, y, z);
        if (d === 0) continue;
        const [nx, ny] = outwardNormal(x, y, halfL, halfW, r);
        verts[o] += nx * d;
        verts[o + 1] += ny * d;
      }
    };
  }

  const noise3D = createNoise3D(mulberry32(1337));

  // Snap pitches so patterns tile a whole (even) number of times around the
  // perimeter — even so half-frequency lattices (hex/weave) also wrap cleanly.
  const P = perimeterLength(halfL, halfW, r);
  const ribCount = Math.max(4, 2 * Math.round(P / pitch / 2));
  const sPitch = P / ribCount;
  const span = Math.max(zMax - zMin, pitch);
  const ringCount = Math.max(1, Math.round(span / pitch));
  const zPitch = span / ringCount;

  const fbm = (x: number, y: number, z: number): number => {
    let sum = 0;
    let amp = 1;
    let freq = 1;
    let norm = 0;
    for (let o = 0; o < 4; o++) {
      sum += amp * noise3D(x * freq, y * freq, z * freq);
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return sum / norm; // -1..1
  };

  const hash2 = (ix: number, iy: number): [number, number] => {
    let h = Math.imul(ix, 73856093) ^ Math.imul(iy, 19349663);
    h = (h ^ (h >>> 13)) >>> 0;
    let h2 = Math.imul(ix, 83492791) ^ Math.imul(iy, 2971215073);
    h2 = (h2 ^ (h2 >>> 13)) >>> 0;
    return [h / 4294967296, h2 / 4294967296];
  };
  const worley = (u: number, v: number): number => {
    const cu = Math.floor(u);
    const cv = Math.floor(v);
    let f1 = Infinity;
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        const [jx, jy] = hash2(wrapInt(cu + di, ribCount), cv + dj);
        const d = Math.hypot(cu + di + jx - u, cv + dj + jy - v);
        if (d < f1) f1 = d;
      }
    }
    return f1;
  };

  const w = 0.46 * (1 - sharpness) + 0.03;
  const contrast = (b: number) => smoothstep(0.5 - w, 0.5 + w, b);

  function field(x: number, y: number, z: number, s: number): number {
    let u = s / sPitch;
    let v = (z - zMin) / zPitch;
    if (distortion > 0) {
      const a = distortion * 1.4;
      const f = 0.06;
      u += a * noise3D(x * f, y * f, z * f);
      v += a * noise3D(x * f + 31.7, y * f + 5.2, z * f + 19.3);
    }
    switch (type) {
      case "ribbing":
        return orientation === "vertical"
          ? 0.5 - 0.5 * Math.cos(TWO_PI * u)
          : 0.5 - 0.5 * Math.cos(TWO_PI * v);
      case "knurling":
        return tri(u + v) * tri(u - v);
      case "noise":
        return 0.5 + 0.5 * fbm(x / pitch, y / pitch, z / pitch);
      case "hex": {
        const a1 = Math.cos(TWO_PI * u);
        const a2 = Math.cos(TWO_PI * (0.5 * u + SQRT3_2 * v));
        const a3 = Math.cos(TWO_PI * (0.5 * u - SQRT3_2 * v));
        return (a1 + a2 + a3 + 1.5) / 4.5;
      }
      case "cells":
        return Math.max(0, 1 - worley(u, v));
      case "waves": {
        const flow = 0.6 * Math.sin(TWO_PI * v * 0.25);
        return 0.5 + 0.5 * Math.sin(TWO_PI * (u + flow));
      }
      case "weave": {
        const over = (Math.floor(u) + Math.floor(v)) % 2 === 0;
        return over ? bar(v) : bar(u);
      }
      default:
        return 0;
    }
  }

  const bottomQuietEnd = bottomFillet > 0 ? zMin + bottomFillet : zMin;

  return function warp(verts: Float64Array, count: number) {
    for (let i = 0; i < count; i++) {
      const o = i * 3;
      const x = verts[o];
      const y = verts[o + 1];
      const z = verts[o + 2];

      if (applyBottomCapShrink(verts, o, x, y, z)) continue;

      if (!isShellWallVertex(x, y, z, halfL, halfW, r, zMin, zMax)) continue;

      let d = profileOffset(x, y, z);
      const band =
        z > bottomQuietEnd
          ? Math.min(
              smoothstep(bottomQuietEnd, bottomQuietEnd + taperBand, z),
              1 - smoothstep(zMax - taperBand, zMax, z),
            )
          : 0;
      if (band > 0) {
        const s = perimeterParam(x, y, halfL, halfW, r);
        const raw = Math.min(1, Math.max(0, field(x, y, z, s)));
        d += amplitude * contrast(raw) * band;
      }
      if (d === 0) continue;

      const [nx, ny] = outwardNormal(x, y, halfL, halfW, r);
      verts[o] = x + nx * d;
      verts[o + 1] = y + ny * d;
      // z is intentionally untouched: finishes/taper wrap the walls, not the caps.
    }
  };
}
