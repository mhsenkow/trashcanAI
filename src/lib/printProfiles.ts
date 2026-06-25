// Filament material profiles + printer-setting helpers.
//
// These drive print-readiness feedback: press-fit clearances, shrinkage
// compensation, minimum walls, and the volume→mass/filament/time estimates.
// Numbers are pragmatic FDM defaults, not lab values — good starting points the
// user calibrates with the test-strip (improvement #16).

export type MaterialId = "pla" | "petg" | "abs" | "asa" | "nylon" | "tpu";
export type FitClass = "press" | "snug" | "slip";

export interface MaterialProfile {
  id: MaterialId;
  name: string;
  /** g/cm³ — for mass estimates. */
  density: number;
  /** Linear shrinkage as a fraction (0.006 = 0.6%); compensation upscales by this. */
  shrinkage: number;
  /** Recommended plug↔wall clearance (mm) per fit class. */
  fit: Record<FitClass, number>;
  /** Recommended minimum printable wall (mm). */
  minWall: number;
  /** One-line print note. */
  note: string;
  /** Viewport preview swatch (#43). */
  previewColor: string;
  previewRoughness: number;
}

export const MATERIALS: Record<MaterialId, MaterialProfile> = {
  pla: {
    id: "pla", name: "PLA", density: 1.24, shrinkage: 0.002,
    fit: { press: 0.05, snug: 0.15, slip: 0.3 }, minWall: 0.8,
    note: "Easy, dimensionally stable — tight fits hold well.",
    previewColor: "#c8e6a8",
    previewRoughness: 0.48,
  },
  petg: {
    id: "petg", name: "PETG", density: 1.27, shrinkage: 0.004,
    fit: { press: 0.15, snug: 0.3, slip: 0.45 }, minWall: 1.0,
    note: "Tough but stringy — size fits a little looser.",
    previewColor: "#7eb8d8",
    previewRoughness: 0.42,
  },
  abs: {
    id: "abs", name: "ABS", density: 1.04, shrinkage: 0.007,
    fit: { press: 0.1, snug: 0.25, slip: 0.4 }, minWall: 1.0,
    note: "Warps without an enclosure; compensate shrinkage.",
    previewColor: "#e8e4dc",
    previewRoughness: 0.55,
  },
  asa: {
    id: "asa", name: "ASA", density: 1.07, shrinkage: 0.006,
    fit: { press: 0.1, snug: 0.25, slip: 0.4 }, minWall: 1.0,
    note: "UV-stable ABS — same shrink/warp caveats.",
    previewColor: "#d4d0c8",
    previewRoughness: 0.52,
  },
  nylon: {
    id: "nylon", name: "Nylon", density: 1.14, shrinkage: 0.012,
    fit: { press: 0.2, snug: 0.35, slip: 0.55 }, minWall: 1.2,
    note: "Strong + flexible, high shrink, dry before printing.",
    previewColor: "#f0ead8",
    previewRoughness: 0.38,
  },
  tpu: {
    id: "tpu", name: "TPU", density: 1.21, shrinkage: 0.003,
    fit: { press: 0.1, snug: 0.25, slip: 0.4 }, minWall: 1.2,
    note: "Flexible — print slow; fits behave softly.",
    previewColor: "#f5a8c8",
    previewRoughness: 0.72,
  },
};

export const MATERIAL_IDS = Object.keys(MATERIALS) as MaterialId[];

export const FIT_LABELS: Record<FitClass, string> = {
  press: "Press",
  snug: "Snug",
  slip: "Slip",
};

/** First-layer XY squish relief when the foot is otherwise sharp (mm). */
export function elephantFootInset(layerHeight: number): number {
  return Math.min(0.25, Math.max(0.1, layerHeight * 0.45));
}

/** Number of perimeter lines a wall thickness resolves to at this line width. */
export function wallLineCount(wall: number, lineWidth: number): number {
  return Math.max(1, Math.round(wall / lineWidth));
}

/** Nearest wall thickness that is a whole number of perimeters (no gap-fill). */
export function snapWallToLines(wall: number, lineWidth: number): number {
  return Number((wallLineCount(wall, lineWidth) * lineWidth).toFixed(2));
}

/** True when a wall is within 0.02 mm of a clean perimeter multiple. */
export function wallIsOnLineMultiple(wall: number, lineWidth: number): boolean {
  return Math.abs(wall - snapWallToLines(wall, lineWidth)) < 0.02;
}

/** Solid layer count for a floor/top thickness at this layer height. */
export function solidLayers(thickness: number, layerHeight: number): number {
  return Math.max(1, Math.round(thickness / layerHeight));
}

/** Plug clearance (mm) recommended for a material + fit class. */
export function fitClearance(material: MaterialId, fit: FitClass): number {
  return MATERIALS[material].fit[fit];
}

/** Uniform scale that pre-compensates for material shrinkage (>1). */
export function shrinkScale(material: MaterialId): number {
  return 1 + MATERIALS[material].shrinkage;
}

/** Approx filament length (mm of 1.75 mm stock) for a printed solid volume (mm³). */
export function filamentLengthMm(volumeMm3: number): number {
  const filamentArea = Math.PI * (1.75 / 2) ** 2; // mm²
  return volumeMm3 / filamentArea;
}

/** Approx printed mass (g) for a solid volume (mm³). */
export function massGrams(volumeMm3: number, material: MaterialId): number {
  return (volumeMm3 / 1000) * MATERIALS[material].density; // mm³→cm³, × g/cm³
}

/**
 * Very rough print-time estimate (minutes) from extruded volume. Models
 * volumetric flow as lineWidth × layerHeight × a typical print speed, with a
 * fudge factor for travel/accel. Real time depends on the slicer, so this is a
 * ballpark for comparing designs, not a slicer figure.
 */
export function printMinutes(
  volumeMm3: number,
  layerHeight: number,
  lineWidth = 0.4,
): number {
  const speed = 100; // mm/s, typical perimeter/infill average
  const flow = lineWidth * layerHeight * speed; // mm³/s
  const overhead = 1.35; // travel, acceleration, non-print moves
  return ((volumeMm3 / flow) * overhead) / 60;
}

/** Human-readable duration from minutes. */
export function formatDuration(minutes: number): string {
  if (!isFinite(minutes) || minutes <= 0) return "—";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
