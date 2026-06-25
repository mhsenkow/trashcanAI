import type { SdfSceneState } from "./state";
import { EDGE_TYPE_TO_FLOAT, SURFACING_TO_FLOAT } from "./shaders/raymarch";

export function stateToUniforms(st: SdfSceneState): Record<string, { value: number | number[] }> {
  const extent =
    Math.max(st.topHalfL, st.topHalfW) + st.taperTop + st.amplitude + st.edgeSize + 40;
  const sceneDepth = st.H + st.lidGap + st.plateT + st.lidLipH + 40;
  return {
    uExtent: { value: extent },
    uSceneDepth: { value: sceneDepth },
    uHalfLWH: { value: [st.halfL, st.halfW, st.H] as [number, number, number] },
    uCornerR: { value: st.r },
    uDraftTan: { value: st.draftTan },
    uFloorT: { value: st.floorT },
    uInnerHalfL: { value: st.innerHalfL },
    uInnerHalfW: { value: st.innerHalfW },
    uInnerR: { value: st.innerR },
    uCavityCenterZ: { value: st.cavityCenterZ },
    uCavityHalfH: { value: st.cavityHalfH },
    uCavityFloorZ: { value: st.cavityFloorZ },
    uEdgeSize: { value: st.edgeSize },
    uEdgeType: { value: EDGE_TYPE_TO_FLOAT[st.edgeType] },
    uInnerEdgeSize: { value: st.innerEdgeSize },
    uFlangeW: { value: st.flangeW },
    uFlangeT: { value: st.flangeT },
    uTopHalfL: { value: st.topHalfL },
    uTopHalfW: { value: st.topHalfW },
    uTopR: { value: st.topR },
    uTaperTop: { value: st.taperTop },
    uAmp: { value: st.amplitude },
    uPitch: { value: st.pitch },
    uSharpness: { value: st.sharpness },
    uDistortion: { value: st.distortion },
    uTaperBand: { value: st.taperBand },
    uSurfType: { value: SURFACING_TO_FLOAT[st.surfacing] ?? 0 },
    uRibVert: { value: st.ribOrientation },
    uRibCount: { value: st.ribCount },
    uSPitch: { value: st.sPitch },
    uZPitch: { value: st.zPitch },
    uIncludeLid: { value: st.includeLid ? 1 : 0 },
    uPlateT: { value: st.plateT },
    uLidGap: { value: st.lidGap },
    uLidLipH: { value: st.lidLipH },
    uLipOL: { value: st.lipOL },
    uLipOW: { value: st.lipOW },
    uLipOR: { value: st.lipOR },
    uLipIL: { value: st.lipIL },
    uLipIW: { value: st.lipIW },
    uLipIR: { value: st.lipIR },
    uTime: { value: 0 },
  };
}

function setUniformValue(slot: { value: unknown }, value: unknown): void {
  const current = slot.value;
  if (Array.isArray(value) && current !== null && typeof current === "object") {
    const setFn = (current as { set?: (...args: number[]) => void }).set;
    if (typeof setFn === "function") {
      if (value.length >= 3) setFn.call(current, value[0], value[1], value[2]);
      else if (value.length === 2) setFn.call(current, value[0], value[1]);
      return;
    }
  }
  slot.value = value;
}

/** Push every scene uniform into an existing ShaderMaterial (call each frame). */
export function applyUniforms(
  mat: { uniforms: Record<string, { value: unknown }> },
  st: SdfSceneState,
): void {
  const next = stateToUniforms(st);
  for (const [key, { value }] of Object.entries(next)) {
    const slot = mat.uniforms[key];
    if (slot) setUniformValue(slot, value);
  }
}
