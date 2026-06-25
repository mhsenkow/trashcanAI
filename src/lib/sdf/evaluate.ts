// Scene distance functions — negative inside solid material.
// Wall draft + base-edge profile: see wallProfile.ts (shared with GPU + Manifold).

import { opUnion, type Vec3 } from "./primitives";
import { cavityDistance, sdExtrudedRoundRect, shellOuterDistance } from "./surfacingField";
import { buildSdfState, type SdfSceneState } from "./state";

export type SdfHit = { d: number; mat: number };

function bodyShellDistance(p: Vec3, st: SdfSceneState): number {
  const [x, y, z] = p;
  const dOuter = shellOuterDistance(x, y, z, st);
  const dCavity = cavityDistance(x, y, z, st);
  return Math.max(dOuter, -dCavity);
}

function flangeDistance(p: Vec3, st: SdfSceneState): number {
  if (!st.hasFlange) return 1e6;
  const [x, y, z] = p;
  const dFlange = sdExtrudedRoundRect(
    x,
    y,
    z,
    st.topHalfL,
    st.topHalfW,
    st.topR,
    st.H + st.flangeT / 2,
    st.flangeT / 2,
  );
  // Cut the flange slab with the cavity so the opening stays open (rim ring only).
  const dCavity = cavityDistance(x, y, z, st);
  return Math.max(dFlange, -dCavity);
}

export function lidDistance(p: Vec3, st: SdfSceneState, zLift: number): number {
  if (!st.includeLid) return 1e6;
  const [x, y, z] = p;
  const plateZ = st.H + st.lidGap + zLift;
  const dPlate = sdExtrudedRoundRect(
    x,
    y,
    z,
    st.topHalfL,
    st.topHalfW,
    st.topR,
    plateZ + st.plateT / 2,
    st.plateT / 2,
  );
  if (st.lidLipH < 1.5 || st.lipIL <= 1 || st.lipIW <= 1) return dPlate;

  const lipZ = plateZ - st.lidLipH / 2;
  const dLipOuter = sdExtrudedRoundRect(
    x,
    y,
    z,
    st.lipOL,
    st.lipOW,
    st.lipOR,
    lipZ,
    st.lidLipH / 2,
  );
  const dLipInner = sdExtrudedRoundRect(
    x,
    y,
    z,
    st.lipIL,
    st.lipIW,
    st.lipIR,
    lipZ,
    st.lidLipH / 2 + 1,
  );
  const lip = Math.max(dLipOuter, -dLipInner);
  return opUnion(dPlate, lip);
}

export function evaluateBody(p: Vec3, st: SdfSceneState): number {
  const shell = bodyShellDistance(p, st);
  const flange = flangeDistance(p, st);
  return opUnion(shell, flange);
}

export function evaluateScene(p: Vec3, st: SdfSceneState): SdfHit {
  const body = evaluateBody(p, st);
  const lid = lidDistance(p, st, 0);
  if (lid < body) return { d: lid, mat: 1 };
  return { d: body, mat: 0 };
}

export function evaluateBodyOnly(p: Vec3, params: Parameters<typeof buildSdfState>[0]): number {
  return evaluateBody(p, buildSdfState(params));
}

export function sceneBounds(st: SdfSceneState): {
  min: Vec3;
  max: Vec3;
} {
  const pad = st.amplitude + st.flangeT + 5;
  const ext = Math.max(st.topHalfL, st.topHalfW) + st.taperTop + pad;
  return {
    min: [-ext, -ext, -pad],
    max: [ext, ext, st.H + st.lidGap + st.plateT + st.lidLipH + pad],
  };
}
