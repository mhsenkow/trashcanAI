// Lightweight parameter store. Components select individual fields so a slider
// drag only re-renders that control, never the whole tree. The geometry hook
// subscribes imperatively (outside React render) to feed the worker.

import { create } from "zustand";
import { DEFAULT_PARAMS, type ReceptacleParams } from "./types";

interface ParamStore extends ReceptacleParams {
  setParam: <K extends keyof ReceptacleParams>(
    key: K,
    value: ReceptacleParams[K],
  ) => void;
  reset: () => void;
}

export const useParamStore = create<ParamStore>((set) => ({
  ...DEFAULT_PARAMS,
  setParam: (key, value) => set({ [key]: value } as Partial<ParamStore>),
  reset: () => set({ ...DEFAULT_PARAMS }),
}));

const PARAM_KEYS: (keyof ReceptacleParams)[] = [
  "length",
  "width",
  "height",
  "cornerRadius",
  "wallThickness",
  "flangeWidth",
  "flangeThickness",
  "surfacing",
  "amplitude",
  "featureScale",
  "ribOrientation",
  "includeLid",
];

/** Extract just the generation-relevant parameters from the store state. */
export function selectParams(state: ParamStore): ReceptacleParams {
  const out = {} as ReceptacleParams;
  for (const k of PARAM_KEYS) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (out as any)[k] = state[k];
  }
  return out;
}
