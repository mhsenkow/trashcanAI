import { create } from "zustand";

export type DisplayUnit = "mm" | "in";

interface UiStore {
  displayUnit: DisplayUnit;
  /** Quantize preview Z to layer bands (#6). */
  layerStepPreview: boolean;
  /** Clip plane height 0..1 (#38). */
  clipEnabled: boolean;
  clipHeight: number;
  /** Wall thickness false-color (#39). */
  wallHeatmap: boolean;
  /** Dimension overlay (#40). */
  showDimensions: boolean;
  measureMode: boolean;
  /** Turntable (#42). */
  autoOrbit: boolean;
  /** Filament color preview (#43). */
  materialPreview: boolean;
  /** Lid press animation (#14). */
  lidAnimate: boolean;
  toggleUnit: () => void;
  toggleLayerStepPreview: () => void;
  toggleClip: () => void;
  setClipHeight: (h: number) => void;
  toggleWallHeatmap: () => void;
  toggleShowDimensions: () => void;
  toggleMeasureMode: () => void;
  toggleAutoOrbit: () => void;
  toggleMaterialPreview: () => void;
  toggleLidAnimate: () => void;
}

export const useUiStore = create<UiStore>((set) => ({
  displayUnit: "mm",
  layerStepPreview: false,
  clipEnabled: false,
  clipHeight: 0.5,
  wallHeatmap: false,
  showDimensions: true,
  measureMode: false,
  autoOrbit: false,
  materialPreview: true,
  lidAnimate: false,
  toggleUnit: () =>
    set((s) => ({ displayUnit: s.displayUnit === "mm" ? "in" : "mm" })),
  toggleLayerStepPreview: () => set((s) => ({ layerStepPreview: !s.layerStepPreview })),
  toggleClip: () => set((s) => ({ clipEnabled: !s.clipEnabled })),
  setClipHeight: (clipHeight) => set({ clipHeight }),
  toggleWallHeatmap: () => set((s) => ({ wallHeatmap: !s.wallHeatmap })),
  toggleShowDimensions: () => set((s) => ({ showDimensions: !s.showDimensions })),
  toggleMeasureMode: () => set((s) => ({ measureMode: !s.measureMode })),
  toggleAutoOrbit: () => set((s) => ({ autoOrbit: !s.autoOrbit })),
  toggleMaterialPreview: () => set((s) => ({ materialPreview: !s.materialPreview })),
  toggleLidAnimate: () => set((s) => ({ lidAnimate: !s.lidAnimate })),
}));

export function formatLength(mm: number, unit: DisplayUnit, digits = 1): string {
  if (unit === "in") return `${(mm / 25.4).toFixed(digits)} in`;
  return `${mm.toFixed(digits)} mm`;
}
