// Surfacing technique definitions — each finish is a distinct *concept* with its
// own field math, slider semantics, and contrast curve. Fields return 0..1 before
// depth (amplitude) and rim fade are applied in surfacing.ts.

import type { RibOrientation, SurfacingType } from "../types";

const TWO_PI = Math.PI * 2;
const SQRT3_2 = 0.8660254037844386;

export interface SurfacingConcept {
  name: string;
  hint: string;
  /** Shown under the type picker while this finish is active. */
  blurb: string;
  amplitudeLabel: string;
  pitchLabel: string;
  sharpnessLabel: string;
  distortionLabel: string;
  /** Distortion domain-warps the (u,v) lattice — most useful on organic finishes. */
  distortionUseful: boolean;
}

export const SURFACING_CONCEPTS: Record<SurfacingType, SurfacingConcept> = {
  smooth: {
    name: "Smooth",
    hint: "No surface treatment",
    blurb: "Clean outer skin — draft and base edge only.",
    amplitudeLabel: "Depth",
    pitchLabel: "Pitch",
    sharpnessLabel: "Sharpness",
    distortionLabel: "Distortion",
    distortionUseful: false,
  },
  ribbing: {
    name: "Aero-Rib",
    hint: "Structural ridges around or across the wall",
    blurb:
      "Periodic ribs — cosine crests sharpen with Sharpness. Vertical reads as panel stiffeners; horizontal as shelf bands.",
    amplitudeLabel: "Rib height",
    pitchLabel: "Rib spacing",
    sharpnessLabel: "Crest sharpness",
    distortionLabel: "Distortion",
    distortionUseful: false,
  },
  knurling: {
    name: "Knurl",
    hint: "Diamond micro-grid for grip",
    blurb:
      "Crossed triangular lattice forming raised diamonds. Sharpness pinches the peaks; pitch sets knurl count.",
    amplitudeLabel: "Peak height",
    pitchLabel: "Knurl pitch",
    sharpnessLabel: "Peak sharpness",
    distortionLabel: "Distortion",
    distortionUseful: false,
  },
  noise: {
    name: "Noise",
    hint: "Multi-octave fuzzy skin",
    blurb:
      "Fractal simplex displacement baked into the mesh. Low sharpness = soft leather; high = ridged bark.",
    amplitudeLabel: "Displacement",
    pitchLabel: "Feature scale",
    sharpnessLabel: "Ridge mix",
    distortionLabel: "Warp",
    distortionUseful: true,
  },
  hex: {
    name: "Hex",
    hint: "Raised hex nubs on a flat honeycomb grid",
    blurb:
      "Discrete bosses at hex cell centres with flat triple-junction troughs — not a cosine honeycomb wash.",
    amplitudeLabel: "Nub height",
    pitchLabel: "Cell size",
    sharpnessLabel: "Nub flatness",
    distortionLabel: "Distortion",
    distortionUseful: false,
  },
  cells: {
    name: "Cells",
    hint: "Voronoi pebble skin",
    blurb:
      "Worley pebble bosses — each cell centre domes outward; gutters stay low between stones.",
    amplitudeLabel: "Pebble height",
    pitchLabel: "Cell size",
    sharpnessLabel: "Pebble definition",
    distortionLabel: "Organic warp",
    distortionUseful: true,
  },
  waves: {
    name: "Waves",
    hint: "Flowing ripples around the perimeter",
    blurb:
      "Phase-modulated sine bands that travel around the wall. Pitch sets wavelength; sharpness tightens crests.",
    amplitudeLabel: "Wave height",
    pitchLabel: "Wavelength",
    sharpnessLabel: "Crest sharpness",
    distortionLabel: "Flow warp",
    distortionUseful: true,
  },
  weave: {
    name: "Weave",
    hint: "Basket over/under threads",
    blurb:
      "Checkerboard of horizontal vs vertical thread bars — sharpness squares off the strands.",
    amplitudeLabel: "Thread height",
    pitchLabel: "Thread pitch",
    sharpnessLabel: "Strand sharpness",
    distortionLabel: "Distortion",
    distortionUseful: false,
  },
};

export function surfacingConcept(type: SurfacingType): SurfacingConcept {
  return SURFACING_CONCEPTS[type];
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const fract = (x: number) => x - Math.floor(x);
const tri = (x: number) => 1 - 2 * Math.abs(fract(x) - 0.5);
const bar = (t: number) => {
  const d = Math.abs(fract(t) - 0.5) * 2;
  return 1 - d * d;
};

function smoothstep(e0: number, e1: number, x: number): number {
  if (e1 <= e0) return x < e0 ? 0 : 1;
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

/** Distance to nearest hex-cell centre in tile (u,v) space. */
export function hexCellCenterDist(u: number, v: number): number {
  const x = u;
  const y = v / SQRT3_2;
  const cx = Math.floor(x + 0.5);
  const cy = Math.floor(y + 0.5);
  let best = Infinity;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const ox = cx + i + (((cy + j) & 1) === 0 ? 0 : 0.5);
      const oy = cy + j;
      const d = Math.hypot(x - ox, (y - oy) * SQRT3_2);
      if (d < best) best = d;
    }
  }
  return best;
}

export type WorleyHash = (ix: number, iy: number) => [number, number];

export function worleyF1F2(
  u: number,
  v: number,
  periodU: number,
  hash2: WorleyHash,
): { f1: number; f2: number } {
  const cu = Math.floor(u);
  const cv = Math.floor(v);
  let f1 = Infinity;
  let f2 = Infinity;
  for (let di = -1; di <= 1; di++) {
    for (let dj = -1; dj <= 1; dj++) {
      const iu = ((cu + di) % periodU + periodU) % periodU;
      const [jx, jy] = hash2(iu, cv + dj);
      const d = Math.hypot(cu + di + jx - u, cv + dj + jy - v);
      if (d < f1) {
        f2 = f1;
        f1 = d;
      } else if (d < f2) {
        f2 = d;
      }
    }
  }
  return { f1, f2 };
}

/** Per-technique contrast — some finishes need a tighter step to read at small depth. */
const CONTRAST_BASE: Partial<Record<SurfacingType, number>> = {
  hex: 0.28,
  knurling: 0.32,
  cells: 0.34,
  ribbing: 0.38,
  weave: 0.36,
  waves: 0.4,
  noise: 0.44,
};

export function surfacingContrast(
  type: SurfacingType,
  raw: number,
  sharpness: number,
): number {
  const base = CONTRAST_BASE[type] ?? 0.42;
  const w = base * (1 - sharpness) + 0.02;
  return smoothstep(0.5 - w, 0.5 + w, raw);
}

export interface FieldArgs {
  u: number;
  v: number;
  x: number;
  y: number;
  z: number;
  pitch: number;
  sharpness: number;
  orientation: RibOrientation;
  fbm: (x: number, y: number, z: number) => number;
  periodU: number;
  hash2: WorleyHash;
}

export function surfacingFieldValue(type: SurfacingType, a: FieldArgs): number {
  switch (type) {
    case "ribbing": {
      const t = a.orientation === "vertical" ? a.u : a.v;
      const crest = 0.5 - 0.5 * Math.cos(TWO_PI * t);
      const exp = 0.35 + 1.25 * a.sharpness;
      return Math.pow(crest, exp);
    }
    case "knurling": {
      const ku = tri(a.u + a.v);
      const kv = tri(a.u - a.v);
      if (a.sharpness <= 0.01) return ku * kv;
      const exp = 0.35 + 1.15 * a.sharpness;
      return Math.pow(ku, exp) * Math.pow(kv, exp);
    }
    case "noise": {
      const n = a.fbm(a.x / a.pitch, a.y / a.pitch, a.z / a.pitch);
      if (a.sharpness > 0.5) {
        const ridged = 1 - Math.abs(n);
        const mix = (a.sharpness - 0.5) / 0.5;
        const blended = n * (1 - mix) + (ridged * 2 - 1) * mix;
        return clamp01(0.5 + 0.5 * blended);
      }
      return clamp01(0.5 + 0.5 * n);
    }
    case "hex": {
      const a1 = Math.cos(TWO_PI * a.u);
      const a2 = Math.cos(TWO_PI * (0.5 * a.u + SQRT3_2 * a.v));
      const a3 = Math.cos(TWO_PI * (0.5 * a.u - SQRT3_2 * a.v));
      const honey = (a1 + a2 + a3 + 1.5) / 4.5;
      if (a.sharpness <= 0.01) return honey;
      const d = hexCellCenterDist(a.u, a.v);
      const cellR = 0.26 + 0.1 * (1 - a.sharpness);
      const nubs = clamp01(1 - d / cellR);
      const exp = 0.18 + 0.82 * a.sharpness;
      const discrete = Math.pow(nubs, exp);
      const mix = Math.min(1, a.sharpness * 1.4);
      return honey * (1 - mix) + discrete * mix;
    }
    case "cells": {
      const { f1 } = worleyF1F2(a.u, a.v, a.periodU, a.hash2);
      const simple = Math.max(0, 1 - f1);
      if (a.sharpness <= 0.35) return simple;
      const pebbleR = 0.2 + 0.12 * (1 - a.sharpness);
      const core = clamp01(1 - f1 / pebbleR);
      const exp = 0.15 + 0.85 * a.sharpness;
      const domed = Math.pow(core, exp);
      const mix = (a.sharpness - 0.35) / 0.65;
      return simple * (1 - mix) + domed * mix;
    }
    case "waves": {
      const flow = 0.55 * Math.sin(TWO_PI * a.v * 0.22);
      const phase = TWO_PI * (a.u + flow);
      const crest = 0.5 + 0.5 * Math.sin(phase);
      const exp = 0.45 + 0.95 * a.sharpness;
      return Math.pow(crest, exp);
    }
    case "weave": {
      const over = (Math.floor(a.u) + Math.floor(a.v)) % 2 === 0;
      const strand = over ? bar(a.v) : bar(a.u);
      const exp = 0.4 + 0.95 * a.sharpness;
      return Math.pow(strand, exp);
    }
    default:
      return 0;
  }
}
