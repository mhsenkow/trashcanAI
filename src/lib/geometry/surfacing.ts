// Algorithmic surfacing — the "digital finishes".
//
// Produces a warp callback for manifold's `warpBatch`. Every side-wall vertex is
// pushed *outward only* (along the exterior normal) by a non-negative amount, so
// the user's wall thickness always remains the minimum. Displacement is tapered
// to zero within a small band at the top and bottom of each part, keeping the
// printable base flat and the top rim clean for the lid to seat against.

import { createNoise3D } from "simplex-noise";
import { outwardNormal, perimeterLength, perimeterParam } from "./profile";
import type { RibOrientation, SurfacingType } from "../types";

// Small deterministic PRNG so the procedural noise finish is identical across
// regenerations and reloads (reproducible STLs).
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
}

export interface WarpContext {
  halfL: number;
  halfW: number;
  r: number;
  zMin: number;
  zMax: number;
  taperBand: number;
}

const TWO_PI = Math.PI * 2;

function smoothstep(e0: number, e1: number, x: number): number {
  if (e1 <= e0) return x < e0 ? 0 : 1;
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

export type WarpFn = (verts: Float64Array, count: number) => void;

/**
 * Build the in-place warp callback for a part spanning [zMin, zMax].
 */
export function makeWarp(cfg: SurfacingConfig, ctx: WarpContext): WarpFn {
  const { type, amplitude, pitch, orientation } = cfg;
  const { halfL, halfW, r, zMin, zMax, taperBand } = ctx;

  if (type === "smooth" || amplitude <= 0) {
    return () => {};
  }

  const noise3D = type === "noise" ? createNoise3D(mulberry32(1337)) : null;

  // Snap pitches so patterns tile a whole number of times around the perimeter
  // (no seam) and up the height.
  const P = perimeterLength(halfL, halfW, r);
  const ribCount = Math.max(3, Math.round(P / pitch));
  const sPitch = P / ribCount; // seamless around the loop
  const span = Math.max(zMax - zMin, pitch);
  const ringCount = Math.max(1, Math.round(span / pitch));
  const zPitch = span / ringCount;

  // Fractal Brownian motion — a richer, more natural fuzzy skin than a single
  // octave: layered detail from coarse swells down to fine grain.
  const OCTAVES = 4;
  const fbm = (x: number, y: number, z: number): number => {
    let sum = 0;
    let amp = 1;
    let freq = 1;
    let norm = 0;
    for (let o = 0; o < OCTAVES; o++) {
      sum += amp * noise3D!(x * freq, y * freq, z * freq);
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return sum / norm; // -1..1
  };

  // Triangle wave in [0, 1] — gives knurling crisp ridges instead of soft humps.
  const tri = (x: number): number => {
    const f = x - Math.floor(x);
    return 1 - 2 * Math.abs(f - 0.5);
  };

  function pattern(x: number, y: number, z: number, s: number): number {
    switch (type) {
      case "ribbing": {
        const phase =
          orientation === "vertical" ? s / sPitch : (z - zMin) / zPitch;
        const c = 0.5 - 0.5 * Math.cos(TWO_PI * phase); // 0..1 raised cosine
        return Math.pow(c, 1.35); // clean valleys, defined rounded ridges
      }
      case "knurling": {
        const u = s / sPitch;
        const v = (z - zMin) / zPitch;
        // Two crossing diagonal triangle gratings -> sharp diamond lattice.
        return Math.pow(tri(u + v) * tri(u - v), 0.8);
      }
      case "noise":
        return 0.5 + 0.5 * fbm(x / pitch, y / pitch, z / pitch);
      default:
        return 0;
    }
  }

  return function warp(verts: Float64Array, count: number) {
    for (let i = 0; i < count; i++) {
      const o = i * 3;
      const x = verts[o];
      const y = verts[o + 1];
      const z = verts[o + 2];

      const taper = Math.min(
        smoothstep(zMin, zMin + taperBand, z),
        1 - smoothstep(zMax - taperBand, zMax, z),
      );
      if (taper <= 0) continue;

      const s = perimeterParam(x, y, halfL, halfW, r);
      const d = amplitude * pattern(x, y, z, s) * taper;
      if (d <= 0) continue;

      const [nx, ny] = outwardNormal(x, y, halfL, halfW, r);
      verts[o] = x + nx * d;
      verts[o + 1] = y + ny * d;
      // z is intentionally untouched: finishes wrap the walls, not the caps.
    }
  };
}
