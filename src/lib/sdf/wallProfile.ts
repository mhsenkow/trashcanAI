// Wall–floor profile for Manifold mesh warp (surfacing.ts).
// Fillet/chamfer cut *into* the exterior wall–floor corner (negative slope vs the
// floor plane) — material is removed from the outside, not added as an outward bulge.

import type { BaseEdgeType } from "../types";

const HALF_PI = Math.PI / 2;

/**
 * Inward cut depth (mm) at height `zg` above profile base.
 * Zero at zg >= F (nominal wall); peaks at the floor (zg = 0).
 * Apply as `-inset` along the exterior normal (pulls the surface toward the box centre).
 */
export function edgeRadialInset(
  zg: number,
  edgeType: BaseEdgeType,
  edgeSize: number,
  chamferAngleDeg = 45,
): number {
  const F = edgeSize;
  if (F <= 0 || edgeType === "none" || zg < 0) return 0;
  if (zg >= F) return 0;
  if (edgeType === "fillet") {
    const dz = F - zg;
    return F - Math.sqrt(F * F - dz * dz);
  }
  if (edgeType === "bead") {
    const t = zg / F;
    return -0.28 * F * Math.sin(t * Math.PI);
  }
  const ref = Math.tan((45 * Math.PI) / 180);
  const tan = Math.tan((chamferAngleDeg * Math.PI) / 180) || ref;
  const slope = ref / tan;
  return (F - zg) * slope;
}

/** @deprecated Use edgeRadialInset — kept for scripts importing the old name. */
export const edgeRadialOffset = edgeRadialInset;

/** Outward radial offset from wall draft, eased over the base-edge band (mm). */
export function draftRadialOffset(
  zg: number,
  draftTan: number,
  edgeSize: number,
): number {
  if (draftTan === 0) return 0;
  const F = edgeSize;
  if (F <= 0 || zg >= F) return zg * draftTan;
  return F * draftTan * Math.sin((zg / F) * HALF_PI);
}

/** Net exterior radial warp: draft outward minus edge inset inward (mm). */
export function profileRadialOffset(
  zg: number,
  edgeType: BaseEdgeType,
  edgeSize: number,
  draftTan: number,
  chamferAngleDeg = 45,
): number {
  return (
    draftRadialOffset(zg, draftTan, edgeSize) -
    edgeRadialInset(zg, edgeType, edgeSize, chamferAngleDeg)
  );
}

/** Max base-edge size on the interior wall (manifold cavity warp clamp). */
export function innerEdgeSize(
  outerEdgeSize: number,
  innerHalfL: number,
  innerHalfW: number,
  wallT: number,
  H: number,
): number {
  const innerEdgeMax = Math.min(innerHalfL, innerHalfW) * 0.48;
  return Math.min(outerEdgeSize, innerEdgeMax, H * 0.48, Math.max(0, wallT - 0.25));
}

/** Linear draft-only radial growth for SDF cross-sections (mm). */
export function draftOnlyGrow(z: number, H: number, draftTan: number): number {
  const zc = Math.max(0, Math.min(z, H));
  return zc * draftTan;
}
