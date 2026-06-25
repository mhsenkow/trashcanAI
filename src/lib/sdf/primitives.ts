// Signed-distance primitives (Inigo Quilez style). Negative = inside solid.

export type Vec3 = [number, number, number];

export function sdRoundBox(p: Vec3, b: Vec3, r: number): number {
  const q: Vec3 = [
    Math.abs(p[0]) - b[0] + r,
    Math.abs(p[1]) - b[1] + r,
    Math.abs(p[2]) - b[2] + r,
  ];
  const m = Math.max(q[0], Math.max(q[1], q[2]));
  const l = Math.hypot(
    Math.max(q[0], 0),
    Math.max(q[1], 0),
    Math.max(q[2], 0),
  );
  return l + Math.min(m, 0) - r;
}

export function opUnion(a: number, b: number): number {
  return Math.min(a, b);
}

export function opSubtract(a: number, b: number): number {
  return Math.max(a, -b);
}

export function opIntersection(a: number, b: number): number {
  return Math.max(a, b);
}

/** Central-difference gradient → outward normal. */
export function estimateNormal(
  fn: (p: Vec3) => number,
  p: Vec3,
  eps = 0.25,
): Vec3 {
  const dx = fn([p[0] + eps, p[1], p[2]]) - fn([p[0] - eps, p[1], p[2]]);
  const dy = fn([p[0], p[1] + eps, p[2]]) - fn([p[0], p[1] - eps, p[2]]);
  const dz = fn([p[0], p[1], p[2] + eps]) - fn([p[0], p[1], p[2] - eps]);
  const l = Math.hypot(dx, dy, dz) || 1;
  return [dx / l, dy / l, dz / l];
}

export function smoothstep(e0: number, e1: number, x: number): number {
  if (e1 <= e0) return x < e0 ? 0 : 1;
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}
