// Derives feasible slider ranges and suggested ticks from the key box dimensions
// (length, width, height, wall thickness). Keeps surfacing depth/pitch inside what
// the shell can carry without folding or punching through thin walls.

import type { ReceptacleParams, SurfacingType } from "./types";
import { evaluateBaseEdge, evaluateTopEdge } from "./paramValidation";

export interface SliderSpec {
  min: number;
  max: number;
  step: number;
  /** Suggested tick positions shown as subtle slider chunks. */
  marks: number[];
  suggested: number;
  invalid: boolean;
  reason: string | null;
}

export interface DerivedParamSpecs {
  cornerRadius: SliderSpec;
  floorThickness: SliderSpec;
  featureScale: SliderSpec;
  amplitude: SliderSpec;
  sharpness: SliderSpec;
  distortion: SliderSpec;
  baseEdgeSize: SliderSpec;
  topEdgeSize: SliderSpec;
  flangeWidth: SliderSpec;
  flangeThickness: SliderSpec;
  lidClearance: SliderSpec;
  lidLipHeight: SliderSpec;
  smoothing: SliderSpec;
  /** Engine clamp — may be lower than slider max. */
  effectiveAmplitudeCap: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function marksBetween(min: number, max: number, step: number, count = 4): number[] {
  if (max <= min) return [min];
  const out: number[] = [];
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const v = min + t * (max - min);
    out.push(Number((Math.round(v / step) * step).toFixed(4)));
  }
  return [...new Set(out)];
}

/** Max outward feature depth before the warp risks self-intersection (mm). */
export function amplitudeCapForSurfacing(
  surfacing: SurfacingType,
  pitch: number,
  wallT: number,
): number {
  const pitchCap = pitch * AMPLITUDE_PITCH_RATIO[surfacing];
  const wallCap = wallT * WALL_DEPTH_RATIO[surfacing];
  return Math.min(pitchCap, wallCap, 2.5);
}

const AMPLITUDE_PITCH_RATIO: Record<SurfacingType, number> = {
  smooth: 0,
  ribbing: 0.45,
  knurling: 0.4,
  noise: 0.42,
  hex: 0.38,
  cells: 0.4,
  waves: 0.44,
  weave: 0.42,
};

const WALL_DEPTH_RATIO: Record<SurfacingType, number> = {
  smooth: 0,
  ribbing: 0.42,
  knurling: 0.38,
  noise: 0.4,
  hex: 0.32,
  cells: 0.34,
  waves: 0.4,
  weave: 0.36,
};

/** Suggested surfacing defaults when switching finish type at current box size. */
export function surfacingDefaultsForBox(
  type: SurfacingType,
  params: Pick<ReceptacleParams, "length" | "width" | "height" | "wallThickness">,
): Partial<ReceptacleParams> {
  const foot = Math.min(params.length, params.width);
  const pitch = clamp(foot / 72, 2, 8);
  const wall = params.wallThickness;

  const base: Partial<ReceptacleParams> = { surfacing: type };
  if (type === "smooth") return { ...base, amplitude: 0 };

  const depth = (ratio: number) =>
    Number(
      clamp(ratio * pitch, 0.15, amplitudeCapForSurfacing(type, pitch, wall)).toFixed(2),
    );

  switch (type) {
    case "ribbing":
      return {
        ...base,
        featureScale: Number(clamp(pitch, 2.5, 6).toFixed(2)),
        amplitude: depth(0.28),
        sharpness: 0.62,
        distortion: 0,
        ribOrientation: "vertical",
      };
    case "knurling":
      return {
        ...base,
        featureScale: Number(clamp(pitch * 0.85, 2, 5).toFixed(2)),
        amplitude: depth(0.26),
        sharpness: 0.82,
        distortion: 0,
      };
    case "hex":
      return {
        ...base,
        featureScale: Number(clamp(pitch * 0.95, 3, 6).toFixed(2)),
        amplitude: depth(0.3),
        sharpness: 0.78,
        distortion: 0,
      };
    case "cells":
      return {
        ...base,
        featureScale: Number(clamp(pitch * 1.25, 4, 9).toFixed(2)),
        amplitude: depth(0.32),
        sharpness: 0.68,
        distortion: 0.12,
      };
    case "noise":
      return {
        ...base,
        featureScale: Number(clamp(pitch * 1.2, 3, 9).toFixed(2)),
        amplitude: depth(0.22),
        sharpness: 0.42,
        distortion: 0.18,
      };
    case "waves":
      return {
        ...base,
        featureScale: Number(clamp(pitch * 1.15, 3.5, 9).toFixed(2)),
        amplitude: depth(0.28),
        sharpness: 0.58,
        distortion: 0.08,
      };
    case "weave":
      return {
        ...base,
        featureScale: Number(clamp(pitch, 3, 7).toFixed(2)),
        amplitude: depth(0.26),
        sharpness: 0.74,
        distortion: 0,
      };
    default:
      return base;
  }
}

export function deriveParamSpecs(params: ReceptacleParams): DerivedParamSpecs {
  const foot = Math.min(params.length, params.width);
  const wall = params.wallThickness;
  const pitch = Math.max(0.6, params.featureScale);
  const ampCap = amplitudeCapForSurfacing(params.surfacing, pitch, wall);

  const cornerMax = foot / 2;
  const cornerMarks = marksBetween(0, cornerMax, 0.5, 4);

  const floorMax = clamp(params.height - wall - 4, 0.8, 8);
  const floorMarks = marksBetween(0.8, floorMax, 0.1, 3);

  const pitchMin = clamp(wall * 1.1, 1, 4);
  const pitchMax = clamp(foot / 6, pitchMin + 0.5, 14);
  const pitchMarks = marksBetween(pitchMin, pitchMax, 0.25, 4);

  const ampMax = Math.max(0.05, ampCap);
  const ampMarks = marksBetween(0, ampMax, 0.05, 4).filter((m) => m > 0);

  const baseEdge = evaluateBaseEdge(params);
  const topEdge = evaluateTopEdge(params);

  const flangeMax = clamp(foot * 0.22, 0, 50);
  const flangeMarks = marksBetween(0, flangeMax, 0.5, 4);

  const lipMax = clamp(params.height - params.floorThickness - 6, 0, 18);
  const lipMarks = marksBetween(0, lipMax, 0.5, 3);

  const smoothMax = wall < 1.3 ? 2 : wall < 2 ? 3 : 4;
  const smoothMarks = [...new Set([0, 1, 2, smoothMax].filter((m) => m <= 6))];

  const ampInvalid = params.surfacing !== "smooth" && params.amplitude > ampMax + 1e-4;

  return {
    cornerRadius: {
      min: 0,
      max: cornerMax,
      step: 0.5,
      marks: cornerMarks,
      suggested: clamp(params.cornerRadius, 0, cornerMax),
      invalid: params.cornerRadius > cornerMax + 1e-4,
      reason: params.cornerRadius > cornerMax + 1e-4 ? "Larger than half the shorter side" : null,
    },
    floorThickness: {
      min: 0.8,
      max: floorMax,
      step: 0.1,
      marks: floorMarks,
      suggested: clamp(params.floorThickness, 0.8, floorMax),
      invalid: params.floorThickness > floorMax + 1e-4,
      reason:
        params.floorThickness > floorMax + 1e-4
          ? `Leaves less than 4 mm cavity at ${params.height} mm height`
          : null,
    },
    featureScale: {
      min: pitchMin,
      max: pitchMax,
      step: 0.25,
      marks: pitchMarks,
      suggested: clamp(pitch, pitchMin, pitchMax),
      invalid: params.featureScale < pitchMin - 1e-4 || params.featureScale > pitchMax + 1e-4,
      reason:
        params.featureScale < pitchMin - 1e-4
          ? `Pitch too fine for ${wall.toFixed(1)} mm walls`
          : params.featureScale > pitchMax + 1e-4
            ? "Pitch too coarse for this footprint"
            : null,
    },
    amplitude: {
      min: 0,
      max: ampMax,
      step: 0.05,
      marks: ampMarks.length ? ampMarks : [ampMax],
      suggested: clamp(params.amplitude, 0, ampMax),
      invalid: ampInvalid,
      reason: ampInvalid
        ? `Max ${ampMax.toFixed(2)} mm at this pitch / wall thickness`
        : null,
    },
    sharpness: {
      min: 0,
      max: 1,
      step: 0.01,
      marks: [0, 0.35, 0.65, 1],
      suggested: params.sharpness,
      invalid: false,
      reason: null,
    },
    distortion: {
      min: 0,
      max: 1,
      step: 0.01,
      marks: [0, 0.25, 0.5, 0.75],
      suggested: params.distortion,
      invalid: false,
      reason: null,
    },
    baseEdgeSize: {
      min: 0,
      max: PARAM_BASE_EDGE_MAX,
      step: baseEdge.maxSize > 0 && baseEdge.maxSize <= 2 ? 0.1 : 0.5,
      marks: marksBetween(0, baseEdge.maxSize, 0.5, 3),
      suggested: baseEdge.effectiveSize,
      invalid: baseEdge.invalid,
      reason: baseEdge.reason,
    },
    topEdgeSize: {
      min: 0,
      max: PARAM_BASE_EDGE_MAX,
      step: topEdge.maxSize > 0 && topEdge.maxSize <= 2 ? 0.1 : 0.5,
      marks: marksBetween(0, topEdge.maxSize, 0.5, 3),
      suggested: topEdge.effectiveSize,
      invalid: topEdge.invalid,
      reason: topEdge.reason,
    },
    flangeWidth: {
      min: 0,
      max: flangeMax,
      step: 0.5,
      marks: flangeMarks,
      suggested: clamp(params.flangeWidth, 0, flangeMax),
      invalid: params.flangeWidth > flangeMax + 1e-4,
      reason: params.flangeWidth > flangeMax + 1e-4 ? "Wide for this footprint" : null,
    },
    flangeThickness: {
      min: 1,
      max: 10,
      step: 0.1,
      marks: [1, 2, 4, 6],
      suggested: params.flangeThickness,
      invalid: false,
      reason: null,
    },
    lidClearance: {
      min: 0,
      max: 0.6,
      step: 0.05,
      marks: [0, 0.15, 0.3, 0.45],
      suggested: params.lidClearance,
      invalid: false,
      reason: null,
    },
    lidLipHeight: {
      min: 0,
      max: lipMax,
      step: 0.5,
      marks: lipMarks,
      suggested: clamp(params.lidLipHeight, 0, lipMax),
      invalid: params.lidLipHeight > lipMax + 1e-4,
      reason:
        params.lidLipHeight > lipMax + 1e-4
          ? "Plug deeper than cavity allows"
          : null,
    },
    smoothing: {
      min: 0,
      max: 6,
      step: 1,
      marks: smoothMarks,
      suggested: clamp(params.smoothing, 0, smoothMax),
      invalid: params.smoothing > smoothMax,
      reason:
        params.smoothing > smoothMax
          ? `${wall.toFixed(1)} mm walls — subdivision > ${smoothMax} is slow / often skipped`
          : null,
    },
    effectiveAmplitudeCap: ampCap,
  };
}

const PARAM_BASE_EDGE_MAX = 40;

/** Clamp dependent params after a key dimension changes. */
export function clampParamsToDerived(params: ReceptacleParams): ReceptacleParams {
  const d = deriveParamSpecs(params);
  const next = { ...params };
  next.cornerRadius = d.cornerRadius.suggested;
  next.floorThickness = d.floorThickness.suggested;
  next.featureScale = d.featureScale.suggested;
  if (next.surfacing !== "smooth") {
    next.amplitude = d.amplitude.suggested;
  }
  next.baseEdgeSize = d.baseEdgeSize.suggested;
  next.flangeWidth = d.flangeWidth.suggested;
  next.lidLipHeight = d.lidLipHeight.suggested;
  if (next.smoothing > d.smoothing.marks[d.smoothing.marks.length - 1]) {
    next.smoothing = d.smoothing.marks[d.smoothing.marks.length - 1];
  }
  return next;
}
