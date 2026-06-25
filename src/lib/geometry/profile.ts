// Rounded-rectangle profile helpers.
//
// The container's cross-section is a rounded rectangle centred on the origin.
// These helpers generate its perimeter polygon and provide two analytic
// quantities used by the surfacing pass:
//   - perimeterParam(): arc-length position of a boundary point (for patterns
//     that run *around* the wall, e.g. vertical ribs / knurl diagonals).
//   - outwardNormal(): the exterior surface normal at a boundary point (the
//     direction surfacing displacement is pushed).
//
// Both are exact for points lying on the ideal rounded rectangle, which is
// exactly where every side-wall vertex of an extruded cross-section lives.

const EPS = 1e-4;

export type Pt = [number, number];

/** Clamp a corner radius to the largest value the half-extents permit. */
export function clampRadius(halfL: number, halfW: number, r: number): number {
  return Math.max(0, Math.min(r, Math.min(halfL, halfW)));
}

/** Total perimeter length of the rounded rectangle. */
export function perimeterLength(halfL: number, halfW: number, r: number): number {
  r = clampRadius(halfL, halfW, r);
  const ax = halfL - r;
  const ay = halfW - r;
  return 4 * ax + 4 * ay + 2 * Math.PI * r;
}

/**
 * Generate a counter-clockwise perimeter polygon with vertices spaced at
 * roughly `spacing` mm. Straight edges and corner arcs are both subdivided so
 * the surfacing pass has uniform horizontal resolution to displace.
 */
export function roundedRectPoints(
  halfL: number,
  halfW: number,
  r: number,
  spacing: number,
  minCornerSegs = 8,
): Pt[] {
  r = clampRadius(halfL, halfW, r);
  const ax = halfL - r;
  const ay = halfW - r;
  const pts: Pt[] = [];
  const step = Math.max(spacing, 0.05);

  // Add points along a straight segment, including the start, excluding the end
  // (the end coincides with the next segment's start).
  const addLine = (x0: number, y0: number, x1: number, y1: number) => {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(1, Math.round(len / step));
    for (let i = 0; i < n; i++) {
      const t = i / n;
      pts.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]);
    }
  };
  // Add points along a corner arc, including the start, excluding the end.
  const addArc = (cx: number, cy: number, a0: number, a1: number) => {
    const arcLen = Math.abs(a1 - a0) * r;
    const n = Math.max(minCornerSegs, Math.round(arcLen / step));
    for (let i = 0; i < n; i++) {
      const a = a0 + (a1 - a0) * (i / n);
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
  };

  if (r < EPS) {
    addLine(halfL, -halfW, halfL, halfW);
    addLine(halfL, halfW, -halfL, halfW);
    addLine(-halfL, halfW, -halfL, -halfW);
    addLine(-halfL, -halfW, halfL, -halfW);
    return pts;
  }

  // CCW starting at the bottom of the right edge.
  addLine(halfL, -ay, halfL, ay); // right edge, going up
  addArc(ax, ay, 0, Math.PI / 2); // top-right corner
  addLine(ax, halfW, -ax, halfW); // top edge, going left
  addArc(-ax, ay, Math.PI / 2, Math.PI); // top-left corner
  addLine(-halfL, ay, -halfL, -ay); // left edge, going down
  addArc(-ax, -ay, Math.PI, Math.PI * 1.5); // bottom-left corner
  addLine(-ax, -halfW, ax, -halfW); // bottom edge, going right
  addArc(ax, -ay, Math.PI * 1.5, Math.PI * 2); // bottom-right corner
  return pts;
}

/**
 * Arc-length position (0..perimeter) of a boundary point, measured CCW from the
 * bottom of the right edge. Continuous around the loop so wall patterns wrap
 * seamlessly. The radius collapses the corner terms to zero for sharp corners.
 */
export function perimeterParam(
  x: number,
  y: number,
  halfL: number,
  halfW: number,
  r: number,
): number {
  r = clampRadius(halfL, halfW, r);
  const ax = halfL - r;
  const ay = halfW - r;
  const cQ = (Math.PI / 2) * r; // quarter-corner arc length
  const eX = 2 * ax; // top/bottom straight-edge length
  const eY = 2 * ay; // left/right straight-edge length

  if (Math.abs(x) > ax && Math.abs(y) > ay) {
    // Corner regions.
    if (x > 0 && y > 0) {
      // top-right
      const phi = Math.atan2(y - ay, x - ax); // 0..pi/2
      return eY + phi * r;
    }
    if (x < 0 && y > 0) {
      // top-left
      const phi = Math.atan2(y - ay, x + ax); // pi/2..pi
      return eY + cQ + eX + (phi - Math.PI / 2) * r;
    }
    if (x < 0 && y < 0) {
      // bottom-left
      let phi = Math.atan2(y + ay, x + ax);
      if (phi < 0) phi += 2 * Math.PI; // pi..3pi/2
      return eY + cQ + eX + cQ + eY + (phi - Math.PI) * r;
    }
    // bottom-right
    let phi = Math.atan2(y + ay, x - ax);
    if (phi < 0) phi += 2 * Math.PI; // 3pi/2..2pi
    return eY + cQ + eX + cQ + eY + cQ + eX + (phi - 1.5 * Math.PI) * r;
  }

  if (Math.abs(x) >= ax) {
    // Vertical edges.
    if (x > 0) return y + ay; // right edge, 0..eY
    return eY + cQ + eX + cQ + (ay - y); // left edge
  }

  // Horizontal edges.
  if (y > 0) return eY + cQ + (ax - x); // top edge
  return eY + cQ + eX + cQ + eY + cQ + (x + ax); // bottom edge
}

const WALL_Z_EPS = 1e-3;

/** True on the outer perimeter of a horizontal cap (floor or lid disc edge). */
export function isExteriorCapRingVertex(
  x: number,
  y: number,
  z: number,
  halfL: number,
  halfW: number,
  r: number,
  zMin: number,
  zMax: number,
): boolean {
  if (Math.abs(z - zMin) > WALL_Z_EPS && Math.abs(z - zMax) > WALL_Z_EPS) return false;
  const cr = clampRadius(halfL, halfW, r);
  const ax = halfL - cr;
  const ay = halfW - cr;
  if (Math.abs(x) < ax - WALL_Z_EPS && Math.abs(y) < ay - WALL_Z_EPS) return false;
  return Math.abs(roundedRectSdf(x, y, halfL, halfW, r)) < 0.35;
}

/**
 * Vertical side-wall faces only — excludes floor/top cap discs so warp does not
 * tear the cap fans or shred the wall–floor junction.
 */
export function isVerticalWallVertex(
  x: number,
  y: number,
  z: number,
  halfL: number,
  halfW: number,
  r: number,
  zMin: number,
  zMax: number,
): boolean {
  if (z <= zMin + WALL_Z_EPS || z >= zMax - WALL_Z_EPS) return false;
  const cr = clampRadius(halfL, halfW, r);
  const ax = halfL - cr;
  const ay = halfW - cr;
  if (Math.abs(x) < ax - WALL_Z_EPS && Math.abs(y) < ay - WALL_Z_EPS) return false;
  return true;
}

/** Signed distance to the rounded-rectangle boundary (negative inside the profile). */
export function roundedRectSdf(
  x: number,
  y: number,
  halfL: number,
  halfW: number,
  r: number,
): number {
  r = clampRadius(halfL, halfW, r);
  const ax = halfL - r;
  const ay = halfW - r;
  const qx = Math.abs(x) - ax;
  const qy = Math.abs(y) - ay;
  return (
    Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r
  );
}

/**
 * Outward unit normal from the rounded-rect SDF gradient. Unlike the piecewise
 * `outwardNormal`, this stays continuous across straight/corner tangents so
 * ribbing and lattice warps do not tear the shell open at vertical corners.
 */
export function outwardNormalSmooth(
  x: number,
  y: number,
  halfL: number,
  halfW: number,
  r: number,
): Pt {
  const eps = Math.max(0.04, r * 0.07);
  const gx =
    (roundedRectSdf(x + eps, y, halfL, halfW, r) -
      roundedRectSdf(x - eps, y, halfL, halfW, r)) /
    (2 * eps);
  const gy =
    (roundedRectSdf(x, y + eps, halfL, halfW, r) -
      roundedRectSdf(x, y - eps, halfL, halfW, r)) /
    (2 * eps);
  const l = Math.hypot(gx, gy);
  if (l < 1e-10) return outwardNormal(x, y, halfL, halfW, r);
  return [gx / l, gy / l];
}

/** Outward (exterior) unit normal of the rounded rectangle at a boundary point. */
export function outwardNormal(
  x: number,
  y: number,
  halfL: number,
  halfW: number,
  r: number,
): Pt {
  r = clampRadius(halfL, halfW, r);
  const ax = halfL - r;
  const ay = halfW - r;

  if (Math.abs(x) > ax && Math.abs(y) > ay) {
    const cx = x > 0 ? ax : -ax;
    const cy = y > 0 ? ay : -ay;
    const nx = x - cx;
    const ny = y - cy;
    const l = Math.hypot(nx, ny) || 1;
    return [nx / l, ny / l];
  }
  if (Math.abs(x) >= ax) {
    return [x >= 0 ? 1 : -1, 0];
  }
  return [0, y >= 0 ? 1 : -1];
}
