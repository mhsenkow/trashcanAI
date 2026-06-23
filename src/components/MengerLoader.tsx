"use client";

import { useEffect, useRef } from "react";

/** True when a discrete cell survives Menger iteration (face + center holes removed). */
function isMengerSolid(x: number, y: number, z: number): boolean {
  let cx = x;
  let cy = y;
  let cz = z;
  while (cx > 0 || cy > 0 || cz > 0) {
    const tx = cx % 3;
    const ty = cy % 3;
    const tz = cz % 3;
    if (
      (tx === 1 && ty === 1) ||
      (tx === 1 && tz === 1) ||
      (ty === 1 && tz === 1)
    ) {
      return false;
    }
    cx = Math.floor(cx / 3);
    cy = Math.floor(cy / 3);
    cz = Math.floor(cz / 3);
  }
  return true;
}

interface Cell {
  x: number;
  y: number;
  z: number;
  phase: number;
}

function buildLevel2Cells(): Cell[] {
  const n = 9; // 3^2
  const cells: Cell[] = [];
  for (let z = 0; z < n; z++) {
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (isMengerSolid(x, y, z)) {
          cells.push({
            x,
            y,
            z,
            phase: (x * 17 + y * 31 + z * 13) % 1000,
          });
        }
      }
    }
  }
  return cells;
}

const CELLS = buildLevel2Cells();

/** Project one cell at unit scale (max pulse / top-face extrusion included). */
function projectCell(cell: Cell, scale: number) {
  const isoX = (cell.x - cell.z) * scale * 0.9;
  const isoY = (cell.x + cell.z) * scale * 0.45 - cell.y * scale * 0.95;
  const cube = scale * 0.72;
  const topFace = cube * 0.22;
  const rightFace = cube * 0.18;
  return {
    isoX,
    isoY,
    left: isoX - cube / 2,
    right: isoX + cube / 2 + rightFace,
    top: isoY - cube / 2 - topFace,
    bottom: isoY + cube / 2,
  };
}

/** Bounding box of the full sponge at unit scale. */
function spongeBounds(cells: Cell[]) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const cell of cells) {
    const p = projectCell(cell, 1);
    if (p.left < minX) minX = p.left;
    if (p.right > maxX) maxX = p.right;
    if (p.top < minY) minY = p.top;
    if (p.bottom > maxY) maxY = p.bottom;
  }
  return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY };
}

const BOUNDS = spongeBounds(CELLS);

/**
 * Isometric Menger-sponge (level 2) loader — pulsing color cubes on canvas.
 */
export function MengerLoader({ label }: { label?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio ?? 1, 2);
    const size = 220;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const padding = size * 0.1;
    const scale = Math.min(
      (size - padding * 2) / BOUNDS.width,
      (size - padding * 2) / BOUNDS.height,
    );
    const cx = size / 2 - ((BOUNDS.minX + BOUNDS.maxX) / 2) * scale;
    const cy = size / 2 - ((BOUNDS.minY + BOUNDS.maxY) / 2) * scale;

    let raf = 0;

    const draw = (t: number) => {
      ctx.clearRect(0, 0, size, size);
      const sorted = [...CELLS].sort((a, b) => a.x + a.z - (b.x + b.z));

      for (const cell of sorted) {
        const { isoX, isoY } = projectCell(cell, scale);
        const pulse = 0.55 + 0.45 * Math.sin(t * 0.0025 + cell.phase * 0.01);
        const hue = (cell.phase * 0.36 + t * 0.04 + cell.y * 8) % 360;
        const light = 48 + pulse * 22;
        const alpha = 0.55 + pulse * 0.45;
        const cube = scale * 0.72 * (0.82 + pulse * 0.18);
        const topFace = cube * 0.22;
        const rightFace = cube * 0.18;

        ctx.fillStyle = `hsla(${hue}, 78%, ${light}%, ${alpha})`;
        ctx.fillRect(cx + isoX - cube / 2, cy + isoY - cube / 2, cube, cube);

        ctx.fillStyle = `hsla(${hue}, 90%, ${light + 18}%, ${alpha * 0.55})`;
        ctx.fillRect(cx + isoX - cube / 2, cy + isoY - cube / 2 - topFace, cube, topFace);
        ctx.fillStyle = `hsla(${hue}, 65%, ${light - 12}%, ${alpha * 0.45})`;
        ctx.fillRect(cx + isoX + cube / 2 - rightFace, cy + isoY - cube / 2, rightFace, cube);
      }

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="flex flex-col items-center gap-4">
      <canvas
        ref={canvasRef}
        className="rounded-lg"
        aria-hidden
      />
      {label && (
        <p className="font-mono text-sm text-zinc-400 tracking-wide">{label}</p>
      )}
    </div>
  );
}
