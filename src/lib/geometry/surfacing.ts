// Algorithmic surfacing + form shaping — the warp callback for manifold's
// `warpBatch`.
//
// Two things are applied as displacements along the exterior normal:
//   1. A profile offset = wall draft (taper) eased in over the bottom-radius
//      band, plus Z curvature that domes the foot without an XY outward step.
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
  /** Bottom fillet radius (mm). */
  bottomFillet?: number;
  /** Global z that the taper + fillet are measured from (default zMin). Pass the
   *  same value (0) for both the wall and the cavity so their profiles stay
   *  concentric and the wall thickness is constant. */
  profileBaseZ?: number;
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
  const profileBaseZ = ctx.profileBaseZ ?? zMin;

  const hasSurfacing = type !== "smooth" && amplitude > 0;
  const hasProfile = draftTan !== 0 || bottomFillet > 0;
  if (!hasSurfacing && !hasProfile) return () => {};

  // Wall draft eased in from the floor (no XY outward step). Z rounding comes
  // only from the domed bottom cap — wall verts stay above the plate edge.
  const profileDisplacement = (
    x: number,
    y: number,
    z: number,
  ): { dr: number; dz: number } => {
    if (!isShellWallVertex(x, y, z, halfL, halfW, r, zMin, zMax)) return { dr: 0, dz: 0 };
    const zg = z - profileBaseZ;
    const F = bottomFillet;
    if (F <= 0 || zg >= F) {
      return { dr: zg * draftTan, dz: 0 };
    }
    const theta = (zg / F) * (Math.PI / 2);
    return { dr: F * draftTan * Math.sin(theta), dz: 0 };
  };

  /** Normalized radial distance 0 at centre, ~1 at the flat part of the footprint edge. */
  const capDist = (x: number, y: number): number =>
    Math.min(1, Math.hypot(x / Math.max(halfL, 0.1), y / Math.max(halfW, 0.1)));

  /** Dome the flat bottom cap; rim stays at zMin so the wall foot meets flush. */
  const applyBottomCapDome = (
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

    const dist = capDist(x, y);
    const domeDip = bottomFillet * (1 - Math.sqrt(Math.max(0, 1 - dist * dist)));
    const interiorBowl = zMin > profileBaseZ + 0.5;
    verts[o + 2] = (interiorBowl ? zMin : profileBaseZ) - domeDip;
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
        if (applyBottomCapDome(verts, o, x, y, z)) continue;
        const { dr, dz } = profileDisplacement(x, y, z);
        if (dr === 0 && dz === 0) continue;
        const [nx, ny] = outwardNormal(x, y, halfL, halfW, r);
        verts[o] += nx * dr;
        verts[o + 1] += ny * dr;
        verts[o + 2] += dz;
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
  const bottomFadeEnd = bottomQuietEnd + taperBand;

  return function warp(verts: Float64Array, count: number) {
    for (let i = 0; i < count; i++) {
      const o = i * 3;
      const x = verts[o];
      const y = verts[o + 1];
      const z = verts[o + 2];

      if (applyBottomCapDome(verts, o, x, y, z)) continue;

      if (!isShellWallVertex(x, y, z, halfL, halfW, r, zMin, zMax)) continue;

      const { dr, dz } = profileDisplacement(x, y, z);
      let d = dr;
      const band =
        z > bottomQuietEnd
          ? Math.min(
              smoothstep(bottomQuietEnd, bottomFadeEnd, z),
              1 - smoothstep(zMax - taperBand, zMax, z),
            )
          : 0;
      if (band > 0) {
        const s = perimeterParam(x, y, halfL, halfW, r);
        const raw = Math.min(1, Math.max(0, field(x, y, z, s)));
        d += amplitude * contrast(raw) * band;
      }
      if (d === 0 && dz === 0) continue;

      const [nx, ny] = outwardNormal(x, y, halfL, halfW, r);
      verts[o] = x + nx * d;
      verts[o + 1] = y + ny * d;
      verts[o + 2] = z + dz;
    }
  };
}
