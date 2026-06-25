// Shared domain types for the parametric receptacle generator.
// All linear units are millimetres (mm) to map cleanly onto slicer/FDM workflows.

import type { MaterialId, FitClass } from "./printProfiles";
import type { OverhangStats } from "./geometry/overhangAnalysis";

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
export type BaseEdgeType = "none" | "fillet" | "chamfer" | "bead";
export type BaseEdgeSides = "all" | "long" | "short";
export type HandleStyle = "none" | "cutout" | "grip";
export type WallMountStyle = "none" | "keyhole";

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
  /** Exterior treatment where the side wall meets the bottom face. */
  baseEdgeType: BaseEdgeType;
  /** Fillet radius or chamfer leg length (mm); 0 when type is none. */
  baseEdgeSize: number;
  /** When true, vertical corners stay at cornerRadius even with a large foot edge (#19). */
  decoupleVerticalCorners: boolean;
  /** Limit base edge to long or short sides only (#20). */
  baseEdgeSides: BaseEdgeSides;
  /** 0 = full inset on all sides, 1 = stronger on +Y (#21). */
  baseEdgeBias: number;
  /** Chamfer angle from horizontal (degrees); 45 = default (#22). */
  chamferAngle: number;

  /** Treatment where the side wall meets the top rim / brim underside. */
  topEdgeType: BaseEdgeType;
  /** Top fillet radius or chamfer leg length (mm); 0 when type is none. */
  topEdgeSize: number;

  /** Recess the underside so only a perimeter rim touches the bed (less warp). */
  footRing: boolean;
  /** Drainage/weep holes punched through the floor (planters, wet storage). */
  drainHoles: boolean;
  /** Diameter of each drainage hole (mm). */
  drainHoleDiameter: number;
  /** Interior wall→floor fillet radius (mm); 0 = sharp. Strength + cleanability. */
  interiorFillet: number;

  /** Rectangular gasket groove at the rim (#15). */
  gasketGroove: boolean;
  gasketWidth: number;
  gasketDepth: number;

  /** M3-style heat-set insert pockets at corners (#17). */
  insertBosses: boolean;
  insertDiameter: number;

  /** Internal divider grid — 0 = off (#29). */
  dividerCols: number;
  dividerRows: number;
  /** Inner stacking lip at the rim (#30). */
  stackLip: boolean;
  stackLipHeight: number;
  /** Nesting taper for stacked bins (mm inset at rim). */
  nestTaper: number;
  /** Front finger scoop (#31). */
  fingerScoop: boolean;
  fingerScoopDepth: number;
  handleStyle: HandleStyle;
  /** Recessed label on front face (#33). */
  labelSlot: boolean;
  labelWidth: number;
  labelHeight: number;
  /** Vent slots on back wall (#35). */
  ventSlots: boolean;
  ventSlotWidth: number;
  wallMount: WallMountStyle;
  /** Gridfinity underside clip pattern (#28). */
  gridfinityBase: boolean;
  /** Export body as bed tiles when oversized (#37). */
  splitForBed: boolean;

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

  /** Target filament — drives clearances, shrinkage, min wall, mass. */
  material: MaterialId;
  /** Press-fit class for the lid; sets a material-aware clearance. */
  lidFit: FitClass;
  /** Pre-scale the mesh to compensate for material shrinkage on export. */
  compensateShrink: boolean;

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
  /** Printed solid volume of the body (mm³) — for mass/filament estimates. */
  bodyVolume: number;
  /** Printed solid volume of the lid (mm³); 0 when no lid. */
  lidVolume: number;
  /** User-specified outer box (length × width × height) before draft/surfacing. */
  nominalDims: [number, number, number];
  /** Actual outer bounding box of the body incl. surfacing (mm). */
  outerDims: [number, number, number];
  /** Minimum drop-in cutout the walls pass through (incl. surfacing) [x, y] mm. */
  cutout: [number, number];
  /** True when the manifold engine produced watertight output. */
  watertight: boolean;
  /** Boundary edges in the exported triangle mesh (0 = topologically closed). */
  nakedEdges: number;
  /** Open rim at the top opening — expected on open-top inserts. */
  rimEdges: number;
  /** Naked edges away from the rim — should be 0 for a valid shell. */
  defectEdges: number;
  nonManifoldEdges: number;
  /** Wall-clock generation time (ms). */
  genMs: number;
  /** Effective amplitude after self-intersection clamping (mm). */
  effectiveAmplitude: number;
  /** Whether the triangle budget forced the mesh density to be coarsened. */
  densityClamped: boolean;
  /** Subdivision smoothing was skipped because the shell was already too dense. */
  smoothingClamped: boolean;
  /** Coarse interactive mesh — full-quality pass may still be running. */
  preview?: boolean;
  /** FDM overhang analysis on the body mesh (faces steeper than 45° from horizontal). */
  overhang?: OverhangStats;
  /** Lid plug engagement depth (mm) when a lip is present (#14). */
  lidEngagementMm?: number;
  /** True when clearance is negative (interference) (#14). */
  lidInterference?: boolean;
  /** Top cove fits under brim without collision (#26). */
  coveBrimOk?: boolean;
}

export type GenerateQuality = "preview" | "full";

export interface GeneratedGeometry {
  body: GeneratedPart;
  lid: GeneratedPart | null;
  stats: GeometryStats;
}

export const DEFAULT_PARAMS: ReceptacleParams = {
  length: 265,
  width: 190,
  height: 150,
  cornerRadius: 4,
  wallThickness: 1,
  floorThickness: 1,
  wallDraft: 2,
  baseEdgeType: "none",
  baseEdgeSize: 0,
  decoupleVerticalCorners: false,
  baseEdgeSides: "all",
  baseEdgeBias: 0,
  chamferAngle: 45,
  topEdgeType: "none",
  topEdgeSize: 0,
  footRing: false,
  drainHoles: false,
  drainHoleDiameter: 4,
  interiorFillet: 0,
  gasketGroove: false,
  gasketWidth: 2,
  gasketDepth: 1,
  insertBosses: false,
  insertDiameter: 4,
  dividerCols: 0,
  dividerRows: 0,
  stackLip: false,
  stackLipHeight: 2,
  nestTaper: 0,
  fingerScoop: false,
  fingerScoopDepth: 12,
  handleStyle: "none",
  labelSlot: false,
  labelWidth: 40,
  labelHeight: 12,
  ventSlots: false,
  ventSlotWidth: 8,
  wallMount: "none",
  gridfinityBase: false,
  splitForBed: false,
  flangeWidth: 40,
  flangeThickness: 1,
  surfacing: "ribbing",
  amplitude: 0.35,
  featureScale: 2.5,
  ribOrientation: "vertical",
  sharpness: 0.55,
  distortion: 0,
  smoothing: 2,
  material: "pla",
  lidFit: "snug",
  compensateShrink: false,
  includeLid: true,
  lidClearance: 0.15,
  lidLipHeight: 4,
};

export const PARAM_LIMITS = {
  length: { min: 30, max: 300, step: 1 },
  width: { min: 30, max: 300, step: 1 },
  height: { min: 20, max: 200, step: 1 },
  cornerRadius: { min: 0, max: 60, step: 0.5 },
  wallThickness: { min: 1, max: 6, step: 0.1 },
  floorThickness: { min: 0.8, max: 8, step: 0.1 },
  wallDraft: { min: -10, max: 20, step: 0.5 },
  baseEdgeSize: { min: 0, max: 40, step: 0.5 },
  chamferAngle: { min: 20, max: 70, step: 1 },
  topEdgeSize: { min: 0, max: 40, step: 0.5 },
  gasketWidth: { min: 1, max: 4, step: 0.25 },
  gasketDepth: { min: 0.3, max: 2.5, step: 0.1 },
  insertDiameter: { min: 2, max: 8, step: 0.5 },
  dividerCols: { min: 0, max: 6, step: 1 },
  dividerRows: { min: 0, max: 6, step: 1 },
  stackLipHeight: { min: 1, max: 6, step: 0.5 },
  nestTaper: { min: 0, max: 4, step: 0.25 },
  fingerScoopDepth: { min: 4, max: 30, step: 1 },
  labelWidth: { min: 10, max: 80, step: 1 },
  labelHeight: { min: 4, max: 30, step: 1 },
  ventSlotWidth: { min: 2, max: 20, step: 1 },
  drainHoleDiameter: { min: 1.5, max: 15, step: 0.5 },
  interiorFillet: { min: 0, max: 12, step: 0.5 },
  flangeWidth: { min: 0, max: 50, step: 0.5 },
  flangeThickness: { min: 1, max: 10, step: 0.1 },
  amplitude: { min: 0, max: 2.5, step: 0.05 },
  featureScale: { min: 1, max: 14, step: 0.25 },
  sharpness: { min: 0, max: 1, step: 0.01 },
  distortion: { min: 0, max: 1, step: 0.01 },
  smoothing: { min: 0, max: 6, step: 1 },
  lidClearance: { min: 0, max: 0.6, step: 0.05 },
  lidLipHeight: { min: 0, max: 18, step: 0.5 },
} as const;
