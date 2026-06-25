// Feasibility checks for parameters that interact (base edge vs wall, floor, corners).
// Used for red slider feedback — the engine still clamps on generate.

import type { BaseEdgeType, ReceptacleParams } from "./types";

export interface BaseEdgeLimits {
  /** Hard upper bound from geometry (mm). */
  maxSize: number;
  /** Value the engine will actually use after clamping. */
  effectiveSize: number;
  /** True when the requested size exceeds what can be built. */
  invalid: boolean;
  /** Short explanation for the UI when invalid. */
  reason: string | null;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

/** Max base-edge size (mm) that fits the current box dimensions. */
export function baseEdgeMaxSize(params: ReceptacleParams): number {
  if (params.baseEdgeType === "none") return 0;

  const halfL = params.length / 2;
  const halfW = params.width / 2;
  const H = params.height;

  // The base edge rounds/chamfers the EXTERIOR wall–floor corner — a foot
  // treatment carved from the bottom of the shell. Its size is bounded only by
  // the footprint and the height. It is NOT capped by wall/floor thickness (the
  // inner cavity is filleted to match, so the wall stays constant-thickness) or
  // by the corner radius: the engine rounds the vertical corners to keep up with
  // the foot edge (see `rEff` in engine.ts), so a huge foot fillet stays clean.
  const byFootprint = Math.min(halfL, halfW) * 0.48;
  const byHeight = H * 0.48;

  return Math.min(byFootprint, byHeight);
}

export function evaluateBaseEdge(params: ReceptacleParams): BaseEdgeLimits {
  const type = params.baseEdgeType;
  const size = Math.max(0, params.baseEdgeSize);

  if (type === "none") {
    return { maxSize: 0, effectiveSize: 0, invalid: false, reason: null };
  }

  const maxSize = baseEdgeMaxSize(params);
  if (size <= 0) {
    return { maxSize, effectiveSize: 0, invalid: false, reason: null };
  }

  const effectiveSize = clamp(size, 0, maxSize);
  const invalid = size > maxSize + 1e-4;

  let reason: string | null = null;
  if (invalid) {
    const halfL = params.length / 2;
    const halfW = params.width / 2;
    if (size > Math.min(halfL, halfW) * 0.48 + 1e-4) {
      reason = "Too large for this footprint";
    } else {
      reason = `Max feasible size is ${maxSize.toFixed(1)} mm`;
    }
  }

  return { maxSize, effectiveSize, invalid, reason };
}

export function baseEdgeLabel(type: BaseEdgeType): string {
  switch (type) {
    case "fillet":
      return "Fillet radius";
    case "chamfer":
      return "Chamfer size";
    default:
      return "Size";
  }
}

/** True when a mounting flange (brim) is present. */
function hasBrim(params: ReceptacleParams): boolean {
  return params.flangeWidth > 0.05;
}

/**
 * Max top-edge size (mm). With a brim the edge coves the wall into the brim
 * underside, so it is bounded by the brim width; without one it rounds the open
 * top rim, bounded by the footprint. Both are bounded by a share of the height
 * so the treatment never climbs more than part-way down the wall.
 */
export function topEdgeMaxSize(params: ReceptacleParams): number {
  if (params.topEdgeType === "none") return 0;

  const halfL = params.length / 2;
  const halfW = params.width / 2;
  const byHeight = params.height * 0.4;

  if (hasBrim(params)) {
    return Math.min(byHeight, Math.max(0.5, params.flangeWidth * 0.9));
  }
  return Math.min(byHeight, Math.min(halfL, halfW) * 0.45);
}

export function evaluateTopEdge(params: ReceptacleParams): BaseEdgeLimits {
  const type = params.topEdgeType;
  const size = Math.max(0, params.topEdgeSize);

  if (type === "none") {
    return { maxSize: 0, effectiveSize: 0, invalid: false, reason: null };
  }

  const maxSize = topEdgeMaxSize(params);
  if (size <= 0) {
    return { maxSize, effectiveSize: 0, invalid: false, reason: null };
  }

  const effectiveSize = clamp(size, 0, maxSize);
  const invalid = size > maxSize + 1e-4;

  let reason: string | null = null;
  if (invalid) {
    reason = hasBrim(params)
      ? `Wider than the ${params.flangeWidth.toFixed(0)} mm brim`
      : `Max feasible size is ${maxSize.toFixed(1)} mm`;
  }

  return { maxSize, effectiveSize, invalid, reason };
}
