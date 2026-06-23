/** Lightweight triangle-mesh checks on exported buffers (post-manifold). */

export interface MeshTopology {
  /** Edges belonging to only one triangle — 0 means closed. */
  nakedEdges: number;
  /** Edges shared by more than two triangles. */
  nonManifoldEdges: number;
}

export function analyzeTopology(indices: Uint32Array): MeshTopology {
  const edges = new Map<string, number>();
  const add = (a: number, b: number) => {
    const key = a < b ? `${a},${b}` : `${b},${a}`;
    edges.set(key, (edges.get(key) ?? 0) + 1);
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
  for (const c of edges.values()) {
    if (c === 1) nakedEdges++;
    else if (c > 2) nonManifoldEdges++;
  }
  return { nakedEdges, nonManifoldEdges };
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
