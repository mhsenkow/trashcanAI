import type { ReceptacleParams } from "./types";
import { DEFAULT_PARAMS } from "./types";

export type BuiltinPresetId =
  | "default"
  | "compact"
  | "large"
  | "drop-in"
  | "smooth-planter"
  | "aero-dashboard"
  | "knurl-grip"
  | "hex-honey"
  | "organic-cells";

export interface BuiltinPreset {
  id: BuiltinPresetId;
  name: string;
  description: string;
  params: ReceptacleParams;
  /** Short chip label when shown in quick-pick rows. */
  chip?: string;
}

const p = (overrides: Partial<ReceptacleParams>): ReceptacleParams => ({
  ...DEFAULT_PARAMS,
  ...overrides,
});

export const BUILTIN_PRESETS: BuiltinPreset[] = [
  {
    id: "default",
    name: "Default — Panel insert",
    description: "265×190×150 mm thin-shell insert, 1 mm walls, 40 mm mounting brim",
    params: DEFAULT_PARAMS,
    chip: "Default",
  },
  {
    id: "compact",
    name: "Compact insert",
    description: "Half-scale panel insert for smaller cutouts",
    params: p({
      length: 133,
      width: 95,
      height: 75,
      cornerRadius: 3,
      flangeWidth: 20,
      flangeThickness: 1,
      lidLipHeight: 3,
    }),
    chip: "S",
  },
  {
    id: "large",
    name: "Extra deep",
    description: "Same footprint with 180 mm depth",
    params: p({
      length: 265,
      width: 190,
      height: 180,
      cornerRadius: 5,
      wallThickness: 1.2,
      floorThickness: 1.2,
      flangeWidth: 40,
      flangeThickness: 1.2,
      lidLipHeight: 6,
    }),
    chip: "L",
  },
  {
    id: "drop-in",
    name: "Drop-in mount",
    description: "Wide flange for panel cutouts",
    params: p({ flangeWidth: 12, flangeThickness: 4, wallDraft: 3 }),
    chip: "Flange",
  },
  {
    id: "smooth-planter",
    name: "Smooth planter",
    description: "No surface texture, open top, no lid",
    params: p({
      surfacing: "smooth",
      amplitude: 0,
      includeLid: false,
      flangeWidth: 0,
    }),
    chip: "Smooth",
  },
  {
    id: "aero-dashboard",
    name: "Aero dashboard",
    description: "Vertical ribs tuned for panel aesthetics",
    params: p({
      surfacing: "ribbing",
      ribOrientation: "vertical",
      amplitude: 0.9,
      featureScale: 3.5,
      sharpness: 0.65,
    }),
    chip: "Rib",
  },
  {
    id: "knurl-grip",
    name: "Knurl grip",
    description: "Diamond knurl for tactile grip",
    params: p({
      surfacing: "knurling",
      amplitude: 0.5,
      featureScale: 2.5,
      sharpness: 0.75,
      includeLid: false,
    }),
    chip: "Knurl",
  },
  {
    id: "hex-honey",
    name: "Hex honeycomb",
    description: "Raised hex nubs — tactile honeycomb bosses",
    params: p({
      surfacing: "hex",
      amplitude: 0.6,
      featureScale: 3.8,
      sharpness: 0.78,
      distortion: 0,
      includeLid: false,
    }),
    chip: "Hex",
  },
  {
    id: "organic-cells",
    name: "Organic cells",
    description: "Voronoi pebble skin",
    params: p({
      surfacing: "cells",
      amplitude: 0.65,
      featureScale: 4.5,
      distortion: 0.12,
      sharpness: 0.68,
    }),
    chip: "Cells",
  },
];

export const SIZE_CHIPS: { label: string; presetId: BuiltinPresetId }[] = [
  { label: "S", presetId: "compact" },
  { label: "M", presetId: "default" },
  { label: "L", presetId: "large" },
];

const ARCHETYPE_BY_SURFACING: Partial<Record<ReceptacleParams["surfacing"], BuiltinPresetId>> = {
  smooth: "smooth-planter",
  ribbing: "aero-dashboard",
  knurling: "knurl-grip",
  hex: "hex-honey",
  cells: "organic-cells",
};

/** Surfacing-only slice of a built-in preset (no size / flange / lid side effects). */
export function surfacingPatchFromPreset(id: BuiltinPresetId): Partial<ReceptacleParams> {
  const params = getBuiltinPreset(id).params;
  return {
    surfacing: params.surfacing,
    amplitude: params.amplitude,
    featureScale: params.featureScale,
    ribOrientation: params.ribOrientation,
    sharpness: params.sharpness,
    distortion: params.distortion,
  };
}

/** Defaults for a finish type — archetype presets for the big four, type-only for the rest. */
export function surfacingPatchForType(
  type: ReceptacleParams["surfacing"],
): Partial<ReceptacleParams> {
  const archetype = ARCHETYPE_BY_SURFACING[type];
  if (archetype) return surfacingPatchFromPreset(archetype);
  return type === "smooth" ? { surfacing: type, amplitude: 0 } : { surfacing: type };
}

export function getBuiltinPreset(id: BuiltinPresetId): BuiltinPreset {
  return BUILTIN_PRESETS.find((x) => x.id === id) ?? BUILTIN_PRESETS[0];
}
