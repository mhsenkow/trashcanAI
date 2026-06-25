"use client";

import type { BaseEdgeType } from "@/lib/types";

/** 2D cross-section of the active wall–floor edge (#24). */
export function EdgeProfilePreview({
  edgeType,
  edgeSize,
  chamferAngle = 45,
  topEdgeType,
  topEdgeSize,
}: {
  edgeType: BaseEdgeType;
  edgeSize: number;
  chamferAngle?: number;
  topEdgeType?: BaseEdgeType;
  topEdgeSize?: number;
}) {
  const F = Math.max(edgeSize, 0.5);
  const W = 56;
  const H = 48;
  const pad = 6;
  const wallX = pad + 8;
  const floorY = H - pad;
  const pts: string[] = [];
  const steps = 24;

  if (edgeType === "none" || edgeSize <= 0) {
    pts.push(`${wallX},${pad}`, `${wallX},${floorY}`, `${W - pad},${floorY}`);
  } else if (edgeType === "fillet") {
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const ang = (Math.PI / 2) * t;
      const x = wallX - F + F * Math.cos(ang);
      const y = floorY - F + F * Math.sin(ang);
      pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    pts.push(`${W - pad},${floorY}`);
  } else if (edgeType === "bead") {
    pts.push(`${wallX},${pad}`);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const zg = F * t;
      const bulge = 0.28 * F * Math.sin(t * Math.PI);
      pts.push(`${(wallX - bulge).toFixed(1)},${(floorY - F + zg).toFixed(1)}`);
    }
    pts.push(`${W - pad},${floorY}`);
  } else {
    const run = F / Math.tan((chamferAngle * Math.PI) / 180);
    pts.push(
      `${wallX},${pad}`,
      `${wallX},${floorY - F}`,
      `${wallX - run},${floorY}`,
      `${W - pad},${floorY}`,
    );
  }

  const topPts: string[] = [];
  if (topEdgeType && topEdgeType !== "none" && (topEdgeSize ?? 0) > 0) {
    const T = Math.max(topEdgeSize!, 0.5);
    topPts.push(`${wallX},${pad + T}`, `${wallX - T * 0.35},${pad}`);
  }

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-12 rounded border border-zinc-800 bg-zinc-950/80"
      aria-label="Edge profile cross-section"
    >
      <polyline
        fill="none"
        stroke="#8d949d"
        strokeWidth="1.5"
        points={pts.join(" ")}
      />
      {topPts.length > 0 && (
        <polyline fill="none" stroke="#6b9fff" strokeWidth="1.2" points={topPts.join(" ")} />
      )}
      <line x1={pad} y1={floorY} x2={W - pad} y2={floorY} stroke="#333" strokeWidth="0.5" strokeDasharray="2 2" />
    </svg>
  );
}
