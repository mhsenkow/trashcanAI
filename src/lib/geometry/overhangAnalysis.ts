/** FDM overhang analysis on exported triangle meshes (Z-up, build direction +Z). */

export interface OverhangStats {
  /** Triangles whose slope exceeds the support threshold. */
  supportFaces: number;
  totalFaces: number;
  /** Fraction of exterior faces flagged (0..1). */
  supportRatio: number;
  /** Worst angle from horizontal among flagged faces (degrees). */
  worstAngleDeg: number;
  /** Rough area of flagged faces (mm²) from summed triangle areas. */
  supportAreaMm2: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function triNormal(
  positions: Float32Array,
  ia: number,
  ib: number,
  ic: number,
): [number, number, number] {
  const ax = positions[ia * 3];
  const ay = positions[ia * 3 + 1];
  const az = positions[ia * 3 + 2];
  const bx = positions[ib * 3] - ax;
  const by = positions[ib * 3 + 1] - ay;
  const bz = positions[ib * 3 + 2] - az;
  const cx = positions[ic * 3] - ax;
  const cy = positions[ic * 3 + 1] - ay;
  const cz = positions[ic * 3 + 2] - az;
  const nx = by * cz - bz * cy;
  const ny = bz * cx - bx * cz;
  const nz = bx * cy - by * cx;
  const len = Math.hypot(nx, ny, nz) || 1;
  return [nx / len, ny / len, nz / len];
}

function triArea(
  positions: Float32Array,
  ia: number,
  ib: number,
  ic: number,
): number {
  const ax = positions[ia * 3];
  const ay = positions[ia * 3 + 1];
  const az = positions[ia * 3 + 2];
  const bx = positions[ib * 3] - ax;
  const by = positions[ib * 3 + 1] - ay;
  const bz = positions[ib * 3 + 2] - az;
  const cx = positions[ic * 3] - ax;
  const cy = positions[ic * 3 + 1] - ay;
  const cz = positions[ic * 3 + 2] - az;
  const nx = by * cz - bz * cy;
  const ny = bz * cx - bx * cz;
  const nz = bx * cy - by * cx;
  return 0.5 * Math.hypot(nx, ny, nz);
}

/** Angle from horizontal (0° = flat top, 90° = vertical wall). */
export function angleFromHorizontal(nz: number): number {
  return 90 - (Math.acos(clamp(nz, -1, 1)) * 180) / Math.PI;
}

/** 0 = safe, 1 = needs support. */
export function overhangSeverity(nz: number, thresholdDeg = 45): number {
  if (nz < -0.02) return 1;
  const slope = angleFromHorizontal(nz);
  if (slope <= thresholdDeg) return 0;
  return clamp((slope - thresholdDeg) / (90 - thresholdDeg), 0, 1);
}

export function analyzeOverhang(
  positions: Float32Array,
  indices: Uint32Array,
  thresholdDeg = 45,
): OverhangStats {
  const triCount = indices.length / 3;
  let supportFaces = 0;
  let worstAngleDeg = 0;
  let supportAreaMm2 = 0;

  for (let t = 0; t < triCount; t++) {
    const ia = indices[t * 3];
    const ib = indices[t * 3 + 1];
    const ic = indices[t * 3 + 2];
    const [, , nz] = triNormal(positions, ia, ib, ic);
    const slope = angleFromHorizontal(nz);
    const needs = nz < -0.02 || slope > thresholdDeg;
    if (needs) {
      supportFaces += 1;
      if (slope > worstAngleDeg) worstAngleDeg = slope;
      supportAreaMm2 += triArea(positions, ia, ib, ic);
    }
  }

  return {
    supportFaces,
    totalFaces: triCount,
    supportRatio: triCount > 0 ? supportFaces / triCount : 0,
    worstAngleDeg,
    supportAreaMm2,
  };
}

/** Per-vertex RGB (0..1) for overhang heatmap on welded geometry. */
export function overhangColorsForGeometry(
  positions: Float32Array,
  indices: Uint32Array,
  thresholdDeg = 45,
): Float32Array {
  const vertCount = positions.length / 3;
  const severity = new Float32Array(vertCount);
  const triCount = indices.length / 3;

  for (let t = 0; t < triCount; t++) {
    const ia = indices[t * 3];
    const ib = indices[t * 3 + 1];
    const ic = indices[t * 3 + 2];
    const [, , nz] = triNormal(positions, ia, ib, ic);
    const s = overhangSeverity(nz, thresholdDeg);
    severity[ia] = Math.max(severity[ia], s);
    severity[ib] = Math.max(severity[ib], s);
    severity[ic] = Math.max(severity[ic], s);
  }

  const colors = new Float32Array(vertCount * 3);
  for (let i = 0; i < vertCount; i++) {
    const s = severity[i];
    // safe → teal, caution → amber, critical → red
    const r = clamp(s * 1.15 + (s > 0.5 ? (s - 0.5) * 0.6 : 0), 0, 1);
    const g = clamp(0.72 - s * 0.65, 0.12, 0.72);
    const b = clamp(0.55 - s * 0.45, 0.1, 0.55);
    colors[i * 3] = r;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = b;
  }
  return colors;
}
