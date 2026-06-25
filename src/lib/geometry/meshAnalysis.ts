/** Lightweight triangle-mesh checks on exported buffers (post-manifold). */

export interface MeshTopology {
  /** Edges belonging to only one triangle — 0 means closed. */
  nakedEdges: number;
  /** Edges shared by more than two triangles. */
  nonManifoldEdges: number;
  /** Naked edges at the open top rim (expected on open-top inserts). */
  rimEdges: number;
  /** Naked edges away from the rim — indicates mesh defects. */
  defectEdges: number;
}

function edgeKey(a: number, b: number): string {
  return a < b ? `${a},${b}` : `${b},${a}`;
}

export function analyzeTopology(
  positions: Float32Array,
  indices: Uint32Array,
  topZ?: number,
  rimTol = 1.2,
): MeshTopology {
  const edges = new Map<string, { count: number; a: number; b: number }>();
  const add = (a: number, b: number) => {
    const key = edgeKey(a, b);
    const cur = edges.get(key);
    if (cur) cur.count += 1;
    else edges.set(key, { count: 1, a, b });
  };
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i];
    const b = indices[i + 1];
    const c = indices[i + 2];
    add(a, b);
    add(b, c);
    add(c, a);
  }

  let nakedEdges = 0;
  let nonManifoldEdges = 0;
  let rimEdges = 0;
  let defectEdges = 0;

  const rimZ = topZ ?? Infinity;

  for (const { count, a, b } of edges.values()) {
    if (count === 1) {
      nakedEdges += 1;
      if (topZ !== undefined) {
        const za = positions[a * 3 + 2];
        const zb = positions[b * 3 + 2];
        const zMid = (za + zb) * 0.5;
        if (zMid >= rimZ - rimTol) rimEdges += 1;
        else defectEdges += 1;
      }
    } else if (count > 2) {
      nonManifoldEdges += 1;
    }
  }

  if (topZ === undefined) {
    defectEdges = nakedEdges;
    rimEdges = 0;
  }

  return { nakedEdges, nonManifoldEdges, rimEdges, defectEdges };
}

/** Max X on the +X straight edge near a Z slice (exterior profile QA). */
export function rightEdgeXNearZ(
  positions: Float32Array,
  zTarget: number,
  tol = 0.2,
): number {
  let maxX = 0;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];
    if (Math.abs(z - zTarget) > tol) continue;
    if (Math.abs(y) > 0.6) continue;
    if (x > maxX) maxX = x;
  }
  return maxX;
}
