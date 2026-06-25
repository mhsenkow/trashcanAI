import { create } from "zustand";
import type { ViewPreset } from "./viewPresets";

interface ViewStore {
  /** Bumped to snap back to the default iso framing. */
  frameNonce: number;
  /** Bumped when a named preset is requested. */
  viewNonce: number;
  activePreset: ViewPreset | null;
  /** Color mesh by FDM overhang severity (#3). */
  overhangHeatmap: boolean;
  /** Seat lid on the rim instead of exploded preview (#41). */
  lidInPlace: boolean;
  reframe: () => void;
  setView: (preset: ViewPreset) => void;
  clearActivePreset: () => void;
  toggleOverhangHeatmap: () => void;
  toggleLidInPlace: () => void;
}

export const useViewStore = create<ViewStore>((set) => ({
  frameNonce: 0,
  viewNonce: 0,
  activePreset: null,
  overhangHeatmap: false,
  lidInPlace: false,
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
  toggleOverhangHeatmap: () => set((s) => ({ overhangHeatmap: !s.overhangHeatmap })),
  toggleLidInPlace: () => set((s) => ({ lidInPlace: !s.lidInPlace })),
}));
