"use client";

import { formatLength, useUiStore } from "@/lib/uiStore";
import type { GeneratedGeometry } from "@/lib/types";

/** Screen-space bbox readout — avoids drei Text (troika alpha crash on three r184). */
export function BboxOverlay({ geometry }: { geometry: GeneratedGeometry | null }) {
  const show = useUiStore((s) => s.showDimensions);
  const unit = useUiStore((s) => s.displayUnit);
  if (!show || !geometry) return null;

  const [L, W, H] = geometry.stats.nominalDims;
  return (
    <div className="pointer-events-none absolute bottom-4 right-4 rounded-md border border-white/10 bg-black/50 backdrop-blur px-3 py-2 font-mono text-[11px] text-zinc-300 tabular-nums">
      <p>
        {formatLength(L, unit)} × {formatLength(W, unit)} × {formatLength(H, unit)}
      </p>
      <p className="mt-0.5 text-[10px] text-zinc-500">
        Outer {geometry.stats.outerDims.map((d) => formatLength(d, unit, 0)).join(" × ")}
      </p>
    </div>
  );
}
