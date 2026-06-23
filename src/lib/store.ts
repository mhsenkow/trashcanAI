// Lightweight parameter store. Components select individual fields so a slider
// drag only re-renders that control, never the whole tree. The geometry hook
// subscribes imperatively (outside React render) to feed the worker.

import { create } from "zustand";
import { surfacingPatchForType } from "./paramPresets";
import { DEFAULT_PARAMS, type ReceptacleParams, type SurfacingType } from "./types";

interface ParamStore extends ReceptacleParams {
  /** Bumped on reset() so preset UI can re-sync. */
  resetTick: number;
  /** Bumped when any generation param changes (stable dirty-check trigger). */
  paramsVersion: number;
  setParam: <K extends keyof ReceptacleParams>(
    key: K,
    value: ReceptacleParams[K],
  ) => void;
  /** Switch finish archetype without touching dimensions, flange, or lid. */
  applySurfacing: (type: SurfacingType) => void;
  loadParams: (params: ReceptacleParams) => void;
  reset: () => void;
}

export const useParamStore = create<ParamStore>((set) => ({
  ...DEFAULT_PARAMS,
  resetTick: 0,
  paramsVersion: 0,
  setParam: (key, value) =>
    set((state) => {
      const next = { ...state, [key]: value, paramsVersion: state.paramsVersion + 1 } as ParamStore;
      if (key === "surfacing" && value === "smooth") {
        next.amplitude = 0;
      }
      if (key === "length" || key === "width") {
        const maxR = Math.min(next.length, next.width) / 2;
        if (next.cornerRadius > maxR) next.cornerRadius = maxR;
      }
      return next;
    }),
  applySurfacing: (type) =>
    set((state) => {
      const patch = surfacingPatchForType(type);
      const next = {
        ...state,
        ...patch,
        surfacing: type,
        paramsVersion: state.paramsVersion + 1,
      } as ParamStore;
      if (type === "smooth") next.amplitude = 0;
      return next;
    }),
  loadParams: (params) =>
    set((state) => {
      const next = { ...state, ...params, paramsVersion: state.paramsVersion + 1 } as ParamStore;
      const maxR = Math.min(next.length, next.width) / 2;
      if (next.cornerRadius > maxR) next.cornerRadius = maxR;
      return next;
    }),
  reset: () =>
    set((s) => ({
      ...DEFAULT_PARAMS,
      resetTick: s.resetTick + 1,
      paramsVersion: s.paramsVersion + 1,
    })),
}));

const PARAM_KEYS: (keyof ReceptacleParams)[] = [
  "length",
  "width",
  "height",
  "cornerRadius",
  "wallThickness",
  "floorThickness",
  "wallDraft",
  "bottomFillet",
  "flangeWidth",
  "flangeThickness",
  "surfacing",
  "amplitude",
  "featureScale",
  "ribOrientation",
  "sharpness",
  "distortion",
  "smoothing",
  "includeLid",
  "lidClearance",
  "lidLipHeight",
];

/** Shallow equality for generation-relevant parameters. */
export function paramsEqual(a: ReceptacleParams, b: ReceptacleParams): boolean {
  for (const k of PARAM_KEYS) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((a as any)[k] !== (b as any)[k]) return false;
  }
  return true;
}

/** Extract just the generation-relevant parameters from the store state. */
export function selectParams(state: ParamStore): ReceptacleParams {
  const out = {} as ReceptacleParams;
  for (const k of PARAM_KEYS) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (out as any)[k] = state[k];
  }
  return out;
}
