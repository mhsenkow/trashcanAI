/** Approximate wall thickness heatmap from outer shell vs nominal cavity (#39). */

export function wallThicknessColors(
  positions: Float32Array,
  halfL: number,
  halfW: number,
  wallT: number,
): Float32Array {
  const n = positions.length / 3;
  const colors = new Float32Array(n * 3);
  const target = wallT;
  for (let i = 0; i < n; i++) {
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    const dx = Math.max(0, Math.abs(x) - (halfL - wallT));
    const dy = Math.max(0, Math.abs(y) - (halfW - wallT));
    const dist = Math.hypot(dx, dy);
    const est = Math.max(0.2, wallT - dist * 0.35);
    const ratio = est / target;
    const r = ratio < 0.85 ? 1 : ratio > 1.15 ? 0.2 : 0.3 + (1 - ratio) * 0.5;
    const g = ratio < 0.85 ? 0.25 : ratio > 1.15 ? 0.7 : 0.55 + ratio * 0.25;
    const b = 0.35;
    colors[i * 3] = r;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = b;
  }
  return colors;
}
