// Printer settings (the user's machine), separate from the part's geometry
// params. These feed print-readiness readouts — line counts, solid layers,
// time estimates — and the wall "snap to perimeters" action. They never trigger
// a geometry rebuild on their own.

import { create } from "zustand";

export interface PrinterState {
  /** Nozzle / extrusion line width (mm). */
  nozzle: number;
  /** Layer height (mm). */
  layerHeight: number;
  setNozzle: (v: number) => void;
  setLayerHeight: (v: number) => void;
}

export const NOZZLE_OPTIONS = [0.2, 0.4, 0.6, 0.8];
export const LAYER_OPTIONS = [0.1, 0.15, 0.2, 0.25, 0.3];

export const usePrinterStore = create<PrinterState>((set) => ({
  nozzle: 0.4,
  layerHeight: 0.2,
  setNozzle: (v) => set({ nozzle: v }),
  setLayerHeight: (v) => set({ layerHeight: v }),
}));
