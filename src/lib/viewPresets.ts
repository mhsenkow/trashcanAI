export type ViewPreset =
  | "iso"
  | "front"
  | "back"
  | "left"
  | "right"
  | "top"
  | "bottom";

export interface ViewPresetDef {
  id: ViewPreset;
  label: string;
  title: string;
}

/** Standard orthographic + iso camera presets (scene Y-up, part on XZ build plate). */
export const VIEW_PRESETS: ViewPresetDef[] = [
  { id: "top", label: "Top", title: "Top view" },
  { id: "bottom", label: "Bottom", title: "Bottom view" },
  { id: "front", label: "Front", title: "Front view" },
  { id: "back", label: "Back", title: "Back view" },
  { id: "left", label: "Left", title: "Left view" },
  { id: "right", label: "Right", title: "Right view" },
  { id: "iso", label: "Iso", title: "Isometric view" },
];

export function cameraForPreset(
  preset: ViewPreset,
  maxDim: number,
  bodyHeight: number,
): { position: [number, number, number]; target: [number, number, number] } {
  const targetY = bodyHeight * 0.42;
  const dist = maxDim * 2.2 + 24;
  const target: [number, number, number] = [0, targetY, 0];
  const eps = 0.001;

  switch (preset) {
    case "top":
      return { position: [0, targetY + dist, eps], target };
    case "bottom":
      return { position: [0, targetY - dist, eps], target };
    case "front":
      return { position: [0, targetY, dist], target };
    case "back":
      return { position: [0, targetY, -dist], target };
    case "right":
      return { position: [dist, targetY, 0], target };
    case "left":
      return { position: [-dist, targetY, 0], target };
    case "iso":
    default:
      return { position: [dist, dist * 0.78, dist], target };
  }
}
