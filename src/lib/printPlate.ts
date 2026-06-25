// Bed layout hints for body + lid export (#10).

import type { GeometryStats, ReceptacleParams } from "./types";

export interface PlateLayout {
  bodyFootprint: [number, number];
  lidFootprint: [number, number] | null;
  bedLabel: string;
  fitsOnBed: boolean;
  /** Spacing between body and lid when laid side-by-side (mm). */
  gap: number;
  note: string;
}

const BED_PRESETS: [string, number, number][] = [
  ["220 × 220", 220, 220],
  ["256 × 256", 256, 256],
  ["300 × 300", 300, 300],
];

export function plateLayout(
  params: ReceptacleParams,
  stats: GeometryStats,
  margin = 8,
): PlateLayout {
  const bodyFootprint: [number, number] = [
    stats.outerDims[0],
    stats.outerDims[1],
  ];
  const lidFootprint: [number, number] | null = params.includeLid
    ? [stats.outerDims[0], stats.outerDims[1]]
    : null;

  const gap = 12;
  const rowW = bodyFootprint[0] + (lidFootprint ? gap + lidFootprint[0] : 0);
  const rowH = Math.max(bodyFootprint[1], lidFootprint?.[1] ?? 0);

  let bedLabel = BED_PRESETS[0][0];
  let fitsOnBed = false;
  for (const [label, w, h] of BED_PRESETS) {
    if (rowW + margin * 2 <= w && rowH + margin * 2 <= h) {
      bedLabel = label;
      fitsOnBed = true;
      break;
    }
  }

  let note: string;
  if (!params.includeLid) {
    note = fitsOnBed
      ? `Body fits on a ${bedLabel} mm bed with ~${margin} mm margin.`
      : `Body footprint ${bodyFootprint[0].toFixed(0)}×${bodyFootprint[1].toFixed(0)} mm — use a larger bed or orient diagonally.`;
  } else if (fitsOnBed) {
    note = `Lay body + lid side-by-side on ${bedLabel} mm (${gap} mm gap). Export both STLs.`;
  } else {
    note = `Body+lid need ~${rowW.toFixed(0)}×${rowH.toFixed(0)} mm — print separately on a ${bedLabel}+ bed.`;
  }

  return { bodyFootprint, lidFootprint, bedLabel, fitsOnBed, gap, note };
}
