// Marching-cubes-style surface extraction from an SDF (negative = inside solid).

import { analyzeTopology } from "../geometry/meshAnalysis";
import type { GeneratedGeometry, GeneratedPart, ReceptacleParams } from "../types";
import { evaluateBody, lidDistance, sceneBounds } from "./evaluate";
import { buildSdfState } from "./state";
import type { Vec3 } from "./primitives";

function lerpVertex(p1: Vec3, p2: Vec3, v1: number, v2: number): Vec3 {
  const t = v1 / (v1 - v2);
  return [
    p1[0] + t * (p2[0] - p1[0]),
    p1[1] + t * (p2[1] - p1[1]),
    p1[2] + t * (p2[2] - p1[2]),
  ];
}

export function marchingCubes(
  fn: (p: Vec3) => number,
  min: Vec3,
  max: Vec3,
  cellSize: number,
): GeneratedPart {
  const nx = Math.max(2, Math.min(140, Math.ceil((max[0] - min[0]) / cellSize)));
  const ny = Math.max(2, Math.min(140, Math.ceil((max[1] - min[1]) / cellSize)));
  const nz = Math.max(2, Math.min(140, Math.ceil((max[2] - min[2]) / cellSize)));
  const sx = (max[0] - min[0]) / nx;
  const sy = (max[1] - min[1]) / ny;
  const sz = (max[2] - min[2]) / nz;

  const vals = new Float32Array((nx + 1) * (ny + 1) * (nz + 1));
  const idx = (i: number, j: number, k: number) => i + (nx + 1) * (j + (ny + 1) * k);
  const posAt = (i: number, j: number, k: number): Vec3 => [
    min[0] + i * sx,
    min[1] + j * sy,
    min[2] + k * sz,
  ];

  for (let k = 0; k <= nz; k++) {
    for (let j = 0; j <= ny; j++) {
      for (let i = 0; i <= nx; i++) {
        const p = posAt(i, j, k);
        vals[idx(i, j, k)] = fn(p);
      }
    }
  }

  const positions: number[] = [];
  const indices: number[] = [];
  const vertMap = new Map<string, number>();

  const addVert = (v: Vec3): number => {
    const k = `${v[0].toFixed(4)},${v[1].toFixed(4)},${v[2].toFixed(4)}`;
    const existing = vertMap.get(k);
    if (existing !== undefined) return existing;
    const id = positions.length / 3;
    positions.push(v[0], v[1], v[2]);
    vertMap.set(k, id);
    return id;
  };

  const val = (i: number, j: number, k: number) => vals[idx(i, j, k)];

  const emitQuad = (a: Vec3, b: Vec3, c: Vec3, d: Vec3, insideNeg: boolean) => {
    const ia = addVert(a);
    const ib = addVert(b);
    const ic = addVert(c);
    const id = addVert(d);
    if (insideNeg) {
      indices.push(ia, ib, ic, ia, ic, id);
    } else {
      indices.push(ia, ic, ib, ia, id, ic);
    }
  };

  // X faces
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const v0 = val(i, j, k);
        const v1 = val(i + 1, j, k);
        if ((v0 < 0) === (v1 < 0)) continue;
        const p0 = posAt(i, j, k);
        const p1 = posAt(i + 1, j, k);
        const e0 = lerpVertex(p0, p1, v0, v1);
        const e1 = lerpVertex(posAt(i, j + 1, k), posAt(i + 1, j + 1, k), val(i, j + 1, k), val(i + 1, j + 1, k));
        const e2 = lerpVertex(posAt(i, j + 1, k + 1), posAt(i + 1, j + 1, k + 1), val(i, j + 1, k + 1), val(i + 1, j + 1, k + 1));
        const e3 = lerpVertex(posAt(i, j, k + 1), posAt(i + 1, j, k + 1), val(i, j, k + 1), val(i + 1, j, k + 1));
        emitQuad(e0, e1, e2, e3, v0 < 0);
      }
    }
  }

  // Y faces
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const v0 = val(i, j, k);
        const v1 = val(i, j + 1, k);
        if ((v0 < 0) === (v1 < 0)) continue;
        const e0 = lerpVertex(posAt(i, j, k), posAt(i, j + 1, k), v0, v1);
        const e1 = lerpVertex(posAt(i + 1, j, k), posAt(i + 1, j + 1, k), val(i + 1, j, k), val(i + 1, j + 1, k));
        const e2 = lerpVertex(posAt(i + 1, j, k + 1), posAt(i + 1, j + 1, k + 1), val(i + 1, j, k + 1), val(i + 1, j + 1, k + 1));
        const e3 = lerpVertex(posAt(i, j, k + 1), posAt(i, j + 1, k + 1), val(i, j, k + 1), val(i, j + 1, k + 1));
        emitQuad(e0, e1, e2, e3, v0 < 0);
      }
    }
  }

  // Z faces
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const v0 = val(i, j, k);
        const v1 = val(i, j, k + 1);
        if ((v0 < 0) === (v1 < 0)) continue;
        const e0 = lerpVertex(posAt(i, j, k), posAt(i, j, k + 1), v0, v1);
        const e1 = lerpVertex(posAt(i + 1, j, k), posAt(i + 1, j, k + 1), val(i + 1, j, k), val(i + 1, j, k + 1));
        const e2 = lerpVertex(posAt(i + 1, j + 1, k), posAt(i + 1, j + 1, k + 1), val(i + 1, j + 1, k), val(i + 1, j + 1, k + 1));
        const e3 = lerpVertex(posAt(i, j + 1, k), posAt(i, j + 1, k + 1), val(i, j + 1, k), val(i, j + 1, k + 1));
        emitQuad(e0, e1, e2, e3, v0 < 0);
      }
    }
  }

  return {
    positions: new Float32Array(positions),
    indices: new Uint32Array(indices),
    triangleCount: indices.length / 3,
  };
}

export function exportSdfGeometry(
  params: ReceptacleParams,
  smoothing = 0,
): GeneratedGeometry {
  const t0 = performance.now();
  const st = buildSdfState(params);
  const bounds = sceneBounds(st);
  const longest = Math.max(
    bounds.max[0] - bounds.min[0],
    bounds.max[1] - bounds.min[1],
    bounds.max[2] - bounds.min[2],
  );
  const refine = 1 + smoothing * 0.35;
  const cell = Math.max(0.35, Math.min(st.pitch / (4 * refine), longest / (72 * refine)));

  const body = marchingCubes((p) => evaluateBody(p, st), bounds.min, bounds.max, cell);

  let lid: GeneratedPart | null = null;
  let lidTriangles = 0;
  if (st.includeLid) {
    const lidMin: Vec3 = [bounds.min[0], bounds.min[1], st.H + st.lidGap - 2];
    const lidMax: Vec3 = [bounds.max[0], bounds.max[1], bounds.max[2]];
    lid = marchingCubes((p) => lidDistance(p, st, 0), lidMin, lidMax, cell);
    lidTriangles = lid.triangleCount;
  }

  const topology = analyzeTopology(body.positions, body.indices);
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < body.positions.length; i += 3) {
    const x = body.positions[i];
    const y = body.positions[i + 1];
    const z = body.positions[i + 2];
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }

  return {
    body,
    lid,
    stats: {
      bodyTriangles: body.triangleCount,
      lidTriangles,
      bodyVolume: 0,
      lidVolume: 0,
      outerDims: [maxX - minX, maxY - minY, maxZ - minZ],
      cutout: [
        params.length + 2 * st.taperTop + 2 * st.amplitude,
        params.width + 2 * st.taperTop + 2 * st.amplitude,
      ],
      watertight: topology.defectEdges === 0 && topology.nonManifoldEdges === 0,
      nakedEdges: topology.nakedEdges,
      rimEdges: topology.rimEdges,
      defectEdges: topology.defectEdges,
      nonManifoldEdges: topology.nonManifoldEdges,
      genMs: performance.now() - t0,
      effectiveAmplitude: st.amplitude,
      densityClamped: cell > st.pitch / 3,
      smoothingClamped: false,
    },
  };
}
