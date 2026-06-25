// Precomputed scene values from ReceptacleParams — shared by CPU mesher + GPU uniforms.

import { clampRadius, perimeterLength } from "../geometry/profile";
import { evaluateBaseEdge } from "../paramValidation";
import { innerEdgeSize as computeInnerEdgeSize } from "./wallProfile";
import type { BaseEdgeType, ReceptacleParams, SurfacingType } from "../types";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export interface SdfSceneState {
  halfL: number;
  halfW: number;
  H: number;
  r: number;
  floorT: number;
  wallT: number;
  draftTan: number;
  taperTop: number;
  edgeType: BaseEdgeType;
  edgeSize: number;
  flangeW: number;
  flangeT: number;
  hasFlange: boolean;
  innerHalfL: number;
  innerHalfW: number;
  innerR: number;
  innerEdgeSize: number;
  cavityHalfH: number;
  cavityCenterZ: number;
  topHalfL: number;
  topHalfW: number;
  topR: number;
  surfacing: SurfacingType;
  amplitude: number;
  pitch: number;
  ribOrientation: 0 | 1;
  sharpness: number;
  distortion: number;
  taperBand: number;
  ribCount: number;
  sPitch: number;
  zPitch: number;
  includeLid: boolean;
  lidClearance: number;
  lidLipH: number;
  lipOL: number;
  lipOW: number;
  lipOR: number;
  lipIL: number;
  lipIW: number;
  lipIR: number;
  lipWall: number;
  plateT: number;
  lidGap: number;
}

export function buildSdfState(params: ReceptacleParams): SdfSceneState {
  const L = params.length;
  const W = params.width;
  const H = params.height;
  const halfL = L / 2;
  const halfW = W / 2;
  const wallT = clamp(params.wallThickness, 0.8, Math.min(halfL, halfW) - 0.5);
  const r = clampRadius(halfL, halfW, params.cornerRadius);
  const floorT = clamp(params.floorThickness, 0.8, H - 2);

  const maxTan = (Math.min(halfL, halfW) * 0.8) / H;
  const draftTan = clamp(Math.tan((params.wallDraft * Math.PI) / 180), -maxTan, maxTan);
  const taperTop = H * draftTan;
  const baseEdge = evaluateBaseEdge(params);

  const isSmooth = params.surfacing === "smooth";
  const pitch = Math.max(0.6, params.featureScale);
  const effectiveAmplitude = isSmooth
    ? 0
    : Math.min(Math.max(0, params.amplitude), 0.45 * pitch);

  const taperBand = clamp(H * 0.12, 1.2, 4);
  const P = perimeterLength(halfL, halfW, r);
  const ribCount = Math.max(4, 2 * Math.round(P / pitch / 2));
  const sPitch = P / ribCount;
  const span = Math.max(H, pitch);
  const ringCount = Math.max(1, Math.round(span / pitch));
  const zPitch = span / ringCount;

  const innerHalfL = halfL - wallT;
  const innerHalfW = halfW - wallT;
  const innerR = clampRadius(innerHalfL, innerHalfW, r - wallT);
  const innerEdge = computeInnerEdgeSize(
    baseEdge.effectiveSize,
    innerHalfL,
    innerHalfW,
    wallT,
    H,
  );
  const cavityHalfH = (H - floorT) / 2;
  const cavityCenterZ = floorT + cavityHalfH;

  const flangeW = Math.max(0, params.flangeWidth);
  const flangeT = clamp(params.flangeThickness, 1, 20);
  const hasFlange = flangeW > 0.05;
  const wallTopHalfL = halfL + taperTop;
  const wallTopHalfW = halfW + taperTop;
  const wallTopR = Math.max(0.1, r + taperTop);
  const topHalfL = hasFlange ? wallTopHalfL + flangeW : wallTopHalfL;
  const topHalfW = hasFlange ? wallTopHalfW + flangeW : wallTopHalfW;
  const topR = hasFlange ? wallTopR + flangeW : wallTopR;

  const clearance = clamp(params.lidClearance, 0, 1);
  const lipWall = Math.min(wallT, 2);
  const lipH = Math.min(Math.max(0, params.lidLipHeight), (H - floorT) * 0.85);
  const plateT = Math.max(wallT * 1.5, 1.2);
  const lipOL = innerHalfL + taperTop - clearance;
  const lipOW = innerHalfW + taperTop - clearance;
  const lipOR = clampRadius(lipOL, lipOW, Math.max(0, innerR + taperTop - clearance));
  const lipIL = lipOL - lipWall;
  const lipIW = lipOW - lipWall;
  const lipIR = clampRadius(lipIL, lipIW, Math.max(0, lipOR - lipWall));

  return {
    halfL,
    halfW,
    H,
    r,
    floorT,
    wallT,
    draftTan,
    taperTop,
    edgeType: params.baseEdgeType,
    edgeSize: baseEdge.effectiveSize,
    flangeW,
    flangeT,
    hasFlange,
    innerHalfL,
    innerHalfW,
    innerR,
    innerEdgeSize: innerEdge,
    cavityHalfH,
    cavityCenterZ,
    topHalfL,
    topHalfW,
    topR,
    surfacing: params.surfacing,
    amplitude: effectiveAmplitude,
    pitch,
    ribOrientation: params.ribOrientation === "vertical" ? 0 : 1,
    sharpness: params.sharpness,
    distortion: params.distortion,
    taperBand,
    ribCount,
    sPitch,
    zPitch,
    includeLid: params.includeLid,
    lidClearance: clearance,
    lidLipH: lipH,
    lipOL,
    lipOW,
    lipOR,
    lipIL,
    lipIW,
    lipIR,
    lipWall,
    plateT,
    lidGap: Math.max(10, H * 0.2),
  };
}
