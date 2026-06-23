// Shared domain types for the parametric receptacle generator.
// All linear units are millimetres (mm) to map cleanly onto slicer/FDM workflows.

export type SurfacingType =
  | "smooth"
  | "ribbing"
  | "knurling"
  | "noise"
  | "hex"
  | "cells"
  | "waves"
  | "weave";
export type RibOrientation = "vertical" | "horizontal";

export interface ReceptacleParams {
  /** Outer footprint along X (mm). */
  length: number;
  /** Outer footprint along Y (mm). */
  width: number;
  /** Outer height along Z (mm). */
  height: number;
  /** Outer corner radius (mm). */
  cornerRadius: number;
  /** Side-wall thickness (mm). Defines the minimum exterior wall. */
  wallThickness: number;
  /** Floor thickness (mm). */
  floorThickness: number;
  /** Wall draft angle (degrees); positive = wider at the top (bin taper). */
  wallDraft: number;
  /** Bottom fillet radius (mm); rounds the base inside and out. */
  bottomFillet: number;

  /** Outward mounting-flange width at the top rim (mm); 0 = none. */
  flangeWidth: number;
  /** Vertical thickness of the mounting flange (mm). */
  flangeThickness: number;

  /** Which algorithmic finish is baked into the exterior walls. */
  surfacing: SurfacingType;
  /** Peak outward displacement of the finish (mm). */
  amplitude: number;
  /** Feature pitch / characteristic size of the finish (mm). */
  featureScale: number;
  /** Orientation for the ribbing archetype. */
  ribOrientation: RibOrientation;
  /** Feature edge crispness, 0 = soft/rounded .. 1 = sharp/defined. */
  sharpness: number;
  /** Organic domain-warp of the pattern, 0 = exact .. 1 = strongly flowing. */
  distortion: number;

  /** Subdivision-smoothing level applied to the final mesh (0 = off, up to 6). */
  smoothing: number;

  /** Whether to also generate the matching friction-fit lid. */
  includeLid: boolean;
  /** Press-fit gap between the lid plug and the cavity wall (mm). */
  lidClearance: number;
  /** Depth of the lid's downward plug ring (mm); 0 = plate-only lid. */
  lidLipHeight: number;
}

export interface GeneratedPart {
  /** Flat XYZ vertex positions (mm). */
  positions: Float32Array;
  /** Triangle indices into `positions`. */
  indices: Uint32Array;
  triangleCount: number;
}

export interface GeometryStats {
  bodyTriangles: number;
  lidTriangles: number;
  /** Actual outer bounding box of the body incl. surfacing (mm). */
  outerDims: [number, number, number];
  /** Minimum drop-in cutout the walls pass through (incl. surfacing) [x, y] mm. */
  cutout: [number, number];
  /** True when the manifold engine produced watertight output. */
  watertight: boolean;
  /** Boundary edges in the exported triangle mesh (0 = topologically closed). */
  nakedEdges: number;
  /** Wall-clock generation time (ms). */
  genMs: number;
  /** Effective amplitude after self-intersection clamping (mm). */
  effectiveAmplitude: number;
  /** Whether the triangle budget forced the mesh density to be coarsened. */
  densityClamped: boolean;
}

export interface GeneratedGeometry {
  body: GeneratedPart;
  lid: GeneratedPart | null;
  stats: GeometryStats;
}

export const DEFAULT_PARAMS: ReceptacleParams = {
  length: 90,
  width: 65,
  height: 55,
  cornerRadius: 10,
  wallThickness: 2.4,
  floorThickness: 2.4,
  wallDraft: 5,
  bottomFillet: 4,
  flangeWidth: 6,
  flangeThickness: 3,
  surfacing: "ribbing",
  amplitude: 0.8,
  featureScale: 4,
  ribOrientation: "vertical",
  sharpness: 0.5,
  distortion: 0,
  smoothing: 2,
  includeLid: true,
  lidClearance: 0.25,
  lidLipHeight: 8,
};

export const PARAM_LIMITS = {
  length: { min: 30, max: 250, step: 1 },
  width: { min: 30, max: 250, step: 1 },
  height: { min: 20, max: 200, step: 1 },
  cornerRadius: { min: 0, max: 60, step: 0.5 },
  wallThickness: { min: 1.2, max: 6, step: 0.1 },
  floorThickness: { min: 0.8, max: 8, step: 0.2 },
  wallDraft: { min: -10, max: 20, step: 0.5 },
  bottomFillet: { min: 0, max: 25, step: 0.5 },
  flangeWidth: { min: 0, max: 30, step: 0.5 },
  flangeThickness: { min: 1.2, max: 10, step: 0.1 },
  amplitude: { min: 0, max: 2.5, step: 0.05 },
  featureScale: { min: 1, max: 14, step: 0.25 },
  sharpness: { min: 0, max: 1, step: 0.01 },
  distortion: { min: 0, max: 1, step: 0.01 },
  smoothing: { min: 0, max: 6, step: 1 },
  lidClearance: { min: 0, max: 0.6, step: 0.05 },
  lidLipHeight: { min: 0, max: 18, step: 0.5 },
} as const;
