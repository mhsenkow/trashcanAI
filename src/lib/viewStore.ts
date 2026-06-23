import { create } from "zustand";
import type { ViewPreset } from "./viewPresets";

interface ViewStore {
  /** Bumped to snap back to the default iso framing. */
  frameNonce: number;
  /** Bumped when a named preset is requested. */
  viewNonce: number;
  activePreset: ViewPreset | null;
  reframe: () => void;
  setView: (preset: ViewPreset) => void;
  clearActivePreset: () => void;
}

export const useViewStore = create<ViewStore>((set) => ({
  frameNonce: 0,
  viewNonce: 0,
  activePreset: null,
  reframe: () =>
    set((s) => ({
      activePreset: "iso",
      frameNonce: s.frameNonce + 1,
      viewNonce: s.viewNonce + 1,
    })),
  setView: (preset) =>
    set((s) => ({
      activePreset: preset,
      viewNonce: s.viewNonce + 1,
    })),
  clearActivePreset: () => set({ activePreset: null }),
}));
