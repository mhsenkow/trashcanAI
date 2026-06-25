// Algorithmic surfacing + form shaping — the warp callback for manifold's
// `warpBatch`.
//
// Profile (draft + foot inset) and algorithmic finishes use separate vertex sets:
//   - Foot ring: exterior floor perimeter only (inward chamfer/fillet at z=0).
//   - Side walls: vertical faces only (draft, inset ramp, surfacing fade).
// Floor/top cap interiors are never warped — avoids shredded cap fans.

import { createNoise3D } from "simplex-noise";
import {
  clampRadius,
  isExteriorCapRingVertex,
  isVerticalWallVertex,
  outwardNormalSmooth,
  perimeterLength,
  perimeterParam,
  roundedRectSdf,
} from "./profile";
import type { BaseEdgeType, RibOrientation, SurfacingType } from "../types";
import { profileRadialOffset, edgeRadialInset } from "../sdf/wallProfile";
import {
  surfacingContrast,
  surfacingFieldValue,
  type WorleyHash,
} from "./surfacingConcepts";

export interface SurfacingConfig {
  type: SurfacingType;
  amplitude: number;
  pitch: number;
  orientation: RibOrientation;
  sharpness: number;
  distortion: number;
}

export interface WarpContext {
  halfL: number;
  halfW: number;
  r: number;
  zMin: number;
  zMax: number;
  taperBand: number;
  /** Algorithmic surfacing fades out below this Z (defaults to zMax). */
  surfacingMaxZ?: number;
  draftTan?: number;
  baseEdgeType?: BaseEdgeType;
  baseEdgeSize?: number;
  profileBaseZ?: number;
  /** Top-edge treatment at the wall→brim/rim junction. */
  topEdgeType?: BaseEdgeType;
  topEdgeSize?: number;
  /** Z level the top edge tops out at (brim underside, or open rim). */
  topEdgeZ?: number;
  /** True when a brim is present: cove outward into it. False: round the rim inward. */
  topEdgeBrim?: boolean;
  /** Extra inward cut at the floor ring to offset first-layer elephant foot (mm). */
  footRelief?: number;
  chamferAngle?: number;
  baseEdgeSides?: import("../types").BaseEdgeSides;
  baseEdgeBias?: number;
}

export type WarpFn = (verts: Float64Array, count: number) => void;

function smoothstep(e0: number, e1: number, x: number): number {
  if (e1 <= e0) return x < e0 ? 0 : 1;
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Build the in-place warp callback for a part spanning [zMin, zMax].
 */
export function makeWarp(cfg: SurfacingConfig, ctx: WarpContext): WarpFn {
  const { type, amplitude, pitch, orientation, sharpness, distortion } = cfg;
  const { halfL, halfW, r, zMin, zMax, taperBand } = ctx;
  const surfacingMaxZ = ctx.surfacingMaxZ ?? zMax;
  const draftTan = ctx.draftTan ?? 0;
  const baseEdgeType = ctx.baseEdgeType ?? "none";
  const baseEdgeSize = ctx.baseEdgeSize ?? 0;
  const edgeBand =
    baseEdgeType !== "none" && baseEdgeSize > 0 ? baseEdgeSize : 0;
  const profileBaseZ = ctx.profileBaseZ ?? zMin;

  const topEdgeType = ctx.topEdgeType ?? "none";
  const topEdgeSize = ctx.topEdgeSize ?? 0;
  const topEdgeZ = ctx.topEdgeZ ?? zMax;
  const topEdgeBrim = ctx.topEdgeBrim ?? false;
  const topBand = topEdgeType !== "none" && topEdgeSize > 0 ? topEdgeSize : 0;
  const footRelief = ctx.footRelief ?? 0;
  const chamferAngle = ctx.chamferAngle ?? 45;
  const baseEdgeSides = ctx.baseEdgeSides ?? "all";
  const baseEdgeBias = ctx.baseEdgeBias ?? 0;

  const edgeSideMul = (x: number, y: number): number => {
    if (baseEdgeSides === "long") return Math.abs(x) >= Math.abs(y) ? 0 : 1;
    if (baseEdgeSides === "short") return Math.abs(y) >= Math.abs(x) ? 0 : 1;
    return 1;
  };
  const edgeBiasMul = (y: number): number =>
    1 + baseEdgeBias * (y > 0 ? 0.35 : y < 0 ? -0.12 : 0);

  const hasSurfacing = type !== "smooth" && amplitude > 0;
  const hasProfile = draftTan !== 0 || edgeBand > 0 || topBand > 0;
  if (!hasSurfacing && !hasProfile) return () => {};

  /**
   * Top-edge radial offset: outward to cove the wall into a brim, inward to
   * round an open rim. Gated to the wall surface (SDF ≈ 0) so a wide cove can't
   * drag the flat brim's own underside/outer edge outward with it.
   */
  const topEdgeDr = (x: number, y: number, z: number): number => {
    if (topBand <= 0) return 0;
    const zFromTop = topEdgeZ - z;
    if (zFromTop < 0 || zFromTop >= topBand) return 0;
    if (roundedRectSdf(x, y, halfL, halfW, r) > 0.6) return 0;
    const e = edgeRadialInset(zFromTop, topEdgeType, topEdgeSize, chamferAngle);
    return topEdgeBrim ? e : -e;
  };

  /** Foot inset/chamfer at the exterior floor ring (zg = 0). */
  const footRingDr = (x: number, y: number): number => {
    const mul = edgeSideMul(x, y) * edgeBiasMul(y);
    return (
      profileRadialOffset(0, baseEdgeType, baseEdgeSize * mul, draftTan, chamferAngle) -
      footRelief
    );
  };

  /** Draft + foot inset + top cove/round on vertical walls. */
  const wallProfileDr = (x: number, y: number, z: number): number => {
    const zg = Math.max(0, z - profileBaseZ);
    const mul = edgeSideMul(x, y) * edgeBiasMul(y);
    return (
      profileRadialOffset(zg, baseEdgeType, baseEdgeSize * mul, draftTan, chamferAngle) +
      topEdgeDr(x, y, z)
    );
  };

  const resolveDr = (x: number, y: number, z: number): number => {
    if (
      edgeBand > 0 &&
      isExteriorCapRingVertex(x, y, z, halfL, halfW, r, zMin, zMax) &&
      Math.abs(z - zMin) <= 1e-3
    ) {
      return footRingDr(x, y);
    }
    if (isVerticalWallVertex(x, y, z, halfL, halfW, r, zMin, zMax)) {
      return wallProfileDr(x, y, z);
    }
    return 0;
  };

  if (!hasSurfacing) {
    return function warp(verts: Float64Array, count: number) {
      for (let i = 0; i < count; i++) {
        const o = i * 3;
        const x = verts[o];
        const y = verts[o + 1];
        const z = verts[o + 2];
        const dr = resolveDr(x, y, z);
        if (dr === 0) continue;
        const [nx, ny] = outwardNormalSmooth(x, y, halfL, halfW, r);
        verts[o] += nx * dr;
        verts[o + 1] += ny * dr;
      }
    };
  }

  const noise3D = createNoise3D(mulberry32(1337));

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
    return sum / norm;
  };

  const hash2: WorleyHash = (ix: number, iy: number) => {
    let h = Math.imul(ix, 73856093) ^ Math.imul(iy, 19349663);
    h = (h ^ (h >>> 13)) >>> 0;
    let h2 = Math.imul(ix, 83492791) ^ Math.imul(iy, 2971215073);
    h2 = (h2 ^ (h2 >>> 13)) >>> 0;
    return [h / 4294967296, h2 / 4294967296];
  };

  function field(x: number, y: number, z: number, s: number): number {
    let u = s / sPitch;
    let v = (z - zMin) / zPitch;
    if (distortion > 0) {
      const a = distortion * 1.4;
      const f = 0.06;
      u += a * noise3D(x * f, y * f, z * f);
      v += a * noise3D(x * f + 31.7, y * f + 5.2, z * f + 19.3);
    }
    return surfacingFieldValue(type, {
      u,
      v,
      x,
      y,
      z,
      pitch,
      sharpness,
      orientation,
      fbm,
      periodU: ribCount,
      hash2,
    });
  }

  // Always keep the foot clear of ribs; extend further when chamfer/fillet is active.
  const bottomQuietEnd = zMin + Math.max(edgeBand, taperBand, pitch * 0.35);
  const bottomFadeEnd = bottomQuietEnd + taperBand;

  return function warp(verts: Float64Array, count: number) {
    for (let i = 0; i < count; i++) {
      const o = i * 3;
      const x = verts[o];
      const y = verts[o + 1];
      const z = verts[o + 2];

      const dr = resolveDr(x, y, z);
      let d = dr;

      if (isVerticalWallVertex(x, y, z, halfL, halfW, r, zMin, zMax)) {
        const band =
          z > bottomQuietEnd
            ? Math.min(
                smoothstep(bottomQuietEnd, bottomFadeEnd, z),
                1 - smoothstep(surfacingMaxZ - taperBand, surfacingMaxZ, z),
              )
            : 0;
        if (band > 0) {
          const s = perimeterParam(x, y, halfL, halfW, r);
          const raw = Math.min(1, Math.max(0, field(x, y, z, s)));
          d += amplitude * surfacingContrast(type, raw, sharpness) * band;
        }
      }

      if (d === 0) continue;

      const [nx, ny] = outwardNormalSmooth(x, y, halfL, halfW, r);
      verts[o] = x + nx * d;
      verts[o + 1] = y + ny * d;
      verts[o + 2] = z;
    }
  };
}
