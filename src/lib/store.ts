// Lightweight parameter store. Components select individual fields so a slider
// drag only re-renders that control, never the whole tree. The geometry hook
// subscribes imperatively (outside React render) to feed the worker.

import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { surfacingDefaultsForBox, clampParamsToDerived } from "./paramDerivation";
import { baseEdgeMaxSize, topEdgeMaxSize } from "./paramValidation";
import { fitClearance } from "./printProfiles";
import { DEFAULT_PARAMS, type ReceptacleParams, type SurfacingType } from "./types";

interface ParamStore extends ReceptacleParams {
  /** Bumped on reset() so preset UI can re-sync. */
  resetTick: number;
  /** Bumped when any generation param changes (stable dirty-check trigger). */
  paramsVersion: number;
  undoStack: ReceptacleParams[];
  redoStack: ReceptacleParams[];
  setParam: <K extends keyof ReceptacleParams>(
    key: K,
    value: ReceptacleParams[K],
  ) => void;
  undo: () => void;
  redo: () => void;
  /** Switch finish archetype without touching dimensions, flange, or lid. */
  applySurfacing: (type: SurfacingType) => void;
  loadParams: (params: ReceptacleParams) => void;
  reset: () => void;
}

const KEY_DIM_KEYS = new Set<keyof ReceptacleParams>([
  "length",
  "width",
  "height",
  "wallThickness",
]);

export const useParamStore = create<ParamStore>((set) => ({
  ...DEFAULT_PARAMS,
  resetTick: 0,
  paramsVersion: 0,
  undoStack: [],
  redoStack: [],
  setParam: (key, value) =>
    set((state) => {
      const snapshot = selectParams(state);
      let next = { ...state, [key]: value, paramsVersion: state.paramsVersion + 1 } as ParamStore;
      if (key === "surfacing" && value === "smooth") {
        next.amplitude = 0;
      }
      if (key === "length" || key === "width") {
        const maxR = Math.min(next.length, next.width) / 2;
        if (next.cornerRadius > maxR) next.cornerRadius = maxR;
      }
      if (key === "baseEdgeType") {
        if (value === "none") {
          next.baseEdgeSize = 0;
        } else if (next.baseEdgeSize <= 0) {
          const p = selectParams(next);
          const max = baseEdgeMaxSize({ ...p, baseEdgeType: value as ReceptacleParams["baseEdgeType"] });
          // Start at a clearly visible size (≈60% of feasible) so enabling the
          // edge does something obvious — the user tunes from there.
          next.baseEdgeSize = Number((max * 0.6).toFixed(1));
        }
      }
      if (key === "topEdgeType") {
        if (value === "none") {
          next.topEdgeSize = 0;
        } else if (next.topEdgeSize <= 0) {
          const p = selectParams(next);
          const max = topEdgeMaxSize({ ...p, topEdgeType: value as ReceptacleParams["topEdgeType"] });
          next.topEdgeSize = Number((max * 0.6).toFixed(1));
        }
      }
      // Material or fit class changing re-derives the recommended lid clearance.
      if (key === "material" || key === "lidFit") {
        next.lidClearance = fitClearance(next.material, next.lidFit);
      }
      if (KEY_DIM_KEYS.has(key)) {
        next = { ...next, ...clampParamsToDerived(selectParams(next)) };
      }
      return {
        ...next,
        undoStack: [...state.undoStack, snapshot].slice(-40),
        redoStack: [],
      };
    }),
  undo: () =>
    set((state) => {
      if (!state.undoStack.length) return state;
      const prev = state.undoStack[state.undoStack.length - 1];
      const current = selectParams(state);
      return {
        ...state,
        ...prev,
        undoStack: state.undoStack.slice(0, -1),
        redoStack: [...state.redoStack, current].slice(-40),
        paramsVersion: state.paramsVersion + 1,
      };
    }),
  redo: () =>
    set((state) => {
      if (!state.redoStack.length) return state;
      const next = state.redoStack[state.redoStack.length - 1];
      const current = selectParams(state);
      return {
        ...state,
        ...next,
        redoStack: state.redoStack.slice(0, -1),
        undoStack: [...state.undoStack, current].slice(-40),
        paramsVersion: state.paramsVersion + 1,
      };
    }),
  applySurfacing: (type) =>
    set((state) => {
      const patch = surfacingDefaultsForBox(type, state);
      const next = {
        ...state,
        ...patch,
        surfacing: type,
        paramsVersion: state.paramsVersion + 1,
      } as ParamStore;
      if (type === "smooth") next.amplitude = 0;
      return { ...next, ...clampParamsToDerived(selectParams(next)) };
    }),
  loadParams: (params) =>
    set((state) => {
      const migrated = { ...params } as Partial<ReceptacleParams> & {
        bottomFillet?: number;
      };
      if (migrated.baseEdgeType === undefined) {
        migrated.baseEdgeType = "none";
        migrated.baseEdgeSize = 0;
      }
      if (migrated.topEdgeType === undefined) {
        migrated.topEdgeType = "none";
        migrated.topEdgeSize = 0;
      }
      delete migrated.bottomFillet;
      const next = {
        ...state,
        ...migrated,
        paramsVersion: state.paramsVersion + 1,
      } as ParamStore;
      const maxR = Math.min(next.length, next.width) / 2;
      if (next.cornerRadius > maxR) next.cornerRadius = maxR;
      return next;
    }),
  reset: () =>
    set((s) => ({
      ...DEFAULT_PARAMS,
      resetTick: s.resetTick + 1,
      paramsVersion: s.paramsVersion + 1,
      undoStack: [],
      redoStack: [],
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
  "baseEdgeType",
  "baseEdgeSize",
  "decoupleVerticalCorners",
  "baseEdgeSides",
  "baseEdgeBias",
  "chamferAngle",
  "topEdgeType",
  "topEdgeSize",
  "footRing",
  "drainHoles",
  "drainHoleDiameter",
  "interiorFillet",
  "gasketGroove",
  "gasketWidth",
  "gasketDepth",
  "insertBosses",
  "insertDiameter",
  "dividerCols",
  "dividerRows",
  "stackLip",
  "stackLipHeight",
  "nestTaper",
  "fingerScoop",
  "fingerScoopDepth",
  "handleStyle",
  "labelSlot",
  "labelWidth",
  "labelHeight",
  "ventSlots",
  "ventSlotWidth",
  "wallMount",
  "gridfinityBase",
  "splitForBed",
  "flangeWidth",
  "flangeThickness",
  "surfacing",
  "amplitude",
  "featureScale",
  "ribOrientation",
  "sharpness",
  "distortion",
  "smoothing",
  "material",
  "lidFit",
  "compensateShrink",
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

/** React hook — shallow-stable snapshot of generation params (safe in render). */
export function useGenerationParams(): ReceptacleParams {
  return useParamStore(useShallow(selectParams));
}
