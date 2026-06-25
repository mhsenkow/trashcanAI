// The geometry engine.
//
// Pipeline (all via manifold3d so output is guaranteed watertight):
//   1. Build the outer rounded box as a high-density extrusion.
//   2. Warp its side walls outward with the chosen finish (exterior only).
//   2b. Optionally add an outward mounting flange at the top rim.
//   3. Subtract a smooth inner cavity -> hollow body with a flat floor + rim.
//   4. Optionally build a matching friction-fit lid (solid plate + plug ring).
//   5. Densify the shell before the boolean cut (refine only — no pre-hollow smooth).
//   6. G1-smooth the hollow body after the cut (high dihedral threshold preserves corners).

import type { CrossSection, Manifold, ManifoldToplevel, Mesh } from "manifold-3d";
import { clampRadius, perimeterLength, roundedRectPoints } from "./profile";
import { analyzeTopology } from "./meshAnalysis";
import { evaluateBaseEdge, evaluateTopEdge } from "../paramValidation";
import { amplitudeCapForSurfacing } from "../paramDerivation";
import { makeWarp } from "./surfacing";
import { shrinkScale } from "../printProfiles";
import type {
  GeneratedGeometry,
  GeneratedPart,
  GenerateQuality,
  ReceptacleParams,
} from "../types";

export interface GenerateOptions {
  quality?: GenerateQuality;
}

// Soft cap on base side-wall vertices so pathological pitch/size combos can't
// melt the browser; horizontal & vertical density scale down together.
const MAX_SIDE_VERTS = 900_000;
// Cap on the post-subdivision triangle count (smoothing refine is clamped to it).
const FINAL_TRI_BUDGET = 2_500_000;
// Post-boolean shells above this trip manifold's smoothOut on warped geometry (WASM trap).
const SMOOTH_INPUT_TRI_MAX = 320_000;
// Interactive preview — coarser mesh, no smoothing, skips heavy refine passes.
const PREVIEW_DENSITY_SCALE = 10;
const PREVIEW_MAX_SIDE_VERTS = 40_000;
const PREVIEW_TRI_BUDGET = 80_000;
// Post-hollow smoothOut threshold (deg). Interior 90° corners stay crisp; ribs still soften.
const SMOOTH_MIN_ANGLE = 86;
// Lift cavity bottom above the floor slab so the cutter cap does not notch floor corners.
const CAVITY_FLOOR_LIFT = 0.35;
// Shrink cavity profile slightly so the boolean leaves a hair of wall at interior corners.
const CAVITY_INSET = 0.12;
// Overlap flange into the wall before the shared warp fuses them (mm).
const FLANGE_WELD = 1.0;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Quarter-circle segments so corner arcs stay visually smooth at `spacing` mm. */
function cornerMinSegs(radius: number, spacing: number): number {
  if (radius < 0.05) return 8;
  const arcLen = (Math.PI / 2) * radius;
  return Math.min(40, Math.max(12, Math.ceil(arcLen / Math.max(spacing, 0.05))));
}

/**
 * Extrude with a fine foot stack (chamfer band + surfacing/draft fade) and a
 * coarser shaft above. Prevents preview meshes from jumping 10+ mm before the
 * first warp ring — that gap shredded the wall–floor junction.
 */
function extrudeWithFootBand(
  cs: CrossSection,
  height: number,
  footBand: number,
  edgeBand: number,
  dzBody: number,
): Manifold {
  const bodySegs = Math.max(2, Math.ceil(height / dzBody));
  if (footBand <= 0 || footBand >= height - 1e-6) {
    return cs.extrude(height, bodySegs - 1);
  }

  let z = 0;
  let foot: Manifold | null = null;

  if (edgeBand > 0) {
    const edgeSpacing = clamp(edgeBand / 8, 0.025, 0.35);
    const edgeSegs = Math.max(4, Math.ceil(edgeBand / edgeSpacing));
    foot = cs.extrude(edgeBand, edgeSegs - 1);
    z = edgeBand;
  }

  const transition = footBand - z;
  if (transition > 0.05) {
    const transSpacing = clamp(transition / 6, 0.2, 2);
    const transSegs = Math.max(3, Math.ceil(transition / transSpacing));
    const trans = cs.extrude(transition, transSegs - 1).translate(0, 0, z);
    foot = foot ? foot.add(trans) : trans;
    z = footBand;
  }

  if (!foot) {
    const transSpacing = clamp(footBand / 6, 0.2, 2);
    const transSegs = Math.max(3, Math.ceil(footBand / transSpacing));
    foot = cs.extrude(footBand, transSegs - 1);
    z = footBand;
  }

  const bodyHeight = height - z;
  const bodySegCount = Math.max(2, Math.ceil(bodyHeight / dzBody));
  const shaft = cs.extrude(bodyHeight, bodySegCount - 1).translate(0, 0, z);
  return foot.add(shaft);
}

/** Perimeter spacing that yields ~`nPerim` vertices around a rounded rectangle. */
function perimSpacing(halfL: number, halfW: number, radius: number, nPerim: number): number {
  return perimeterLength(halfL, halfW, radius) / nPerim;
}

/** Subdivide cap fans into rings so warp/smoothing does not tear the base. */
function breakCapFans(
  m: Manifold,
  keep: <T extends Manifold | CrossSection>(o: T) => T,
  discard: (m: Manifold) => void,
  passes = 2,
): Manifold {
  let cur = m;
  for (let i = 0; i < passes; i++) {
    const next = cur.refine(1);
    if (next.numTri() <= 0 || next.status() !== "NoError") {
      next.delete();
      break;
    }
    discard(cur);
    cur = keep(next);
  }
  return cur;
}

function meshToPart(mesh: Mesh): GeneratedPart {
  const { numProp, vertProperties, triVerts } = mesh;
  if (numProp < 3 || vertProperties.length === 0 || triVerts.length === 0) {
    throw new Error("Manifold returned an empty or invalid mesh");
  }
  const vertCount = vertProperties.length / numProp;

  // Element-wise copy — WASM heap views can invalidates if copied via constructor
  // shorthand or if manifold objects are freed before the copy completes.
  const positions = new Float32Array(vertCount * 3);
  for (let i = 0; i < vertCount; i++) {
    positions[i * 3] = vertProperties[i * numProp];
    positions[i * 3 + 1] = vertProperties[i * numProp + 1];
    positions[i * 3 + 2] = vertProperties[i * numProp + 2];
  }
  const triCount = triVerts.length;
  const indices = new Uint32Array(triCount);
  for (let i = 0; i < triCount; i++) indices[i] = triVerts[i];
  return { positions, indices, triangleCount: triCount / 3 };
}

function bbox(positions: Float32Array): [number, number, number] {
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity,
    maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i],
      y = positions[i + 1],
      z = positions[i + 2];
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }
  return [maxX - minX, maxY - minY, maxZ - minZ];
}

export function generate(
  wasm: ManifoldToplevel,
  params: ReceptacleParams,
  options: GenerateOptions = {},
): GeneratedGeometry {
  const isPreview = options.quality === "preview";
  const t0 = performance.now();
  const { CrossSection } = wasm;

  const L = params.length;
  const W = params.width;
  const H = params.height;
  const halfL = L / 2;
  const halfW = W / 2;
  const t = clamp(params.wallThickness, 0.8, Math.min(halfL, halfW) - 0.5);
  const rUser = clampRadius(halfL, halfW, params.cornerRadius);
  const floorT = clamp(params.floorThickness, 0.8, H - 2);

  // Wall draft (outward) + base edge inset (inward cut at the foot) warp the shell.
  const maxTan = (Math.min(halfL, halfW) * 0.8) / H;
  const draftTan = clamp(Math.tan((params.wallDraft * Math.PI) / 180), -maxTan, maxTan);
  const taperTop = H * draftTan;
  const baseEdge = evaluateBaseEdge(params);
  const edgeO = baseEdge.effectiveSize;
  const edgeType = params.baseEdgeType;
  const hasBaseEdge = edgeType !== "none" && edgeO > 0;
  const topEdge = evaluateTopEdge(params);
  const topEdgeO = topEdge.effectiveSize;
  const topEdgeType = params.topEdgeType;

  // A rounded vertical corner turns inside-out if the foot is pulled inward past
  // its radius — that was the sliver "overhang" at the corners. So the box
  // corners round to keep pace with the foot edge (a hair more, so a sliver of
  // rounded corner still survives at the very floor). This is what lets the base
  // fillet/chamfer go large and stay a clean, watertight mesh. The corner slider
  // is the *minimum* vertical radius; a bigger foot edge rounds the box further.
  const r = hasBaseEdge
    ? clampRadius(halfL, halfW, Math.max(rUser, edgeO * 1.12))
    : rUser;

  const isSmooth = params.surfacing === "smooth";
  const pitch = Math.max(0.6, params.featureScale);
  const ampCap = amplitudeCapForSurfacing(params.surfacing, pitch, t);
  const effectiveAmplitude = isSmooth
    ? 0
    : Math.min(Math.max(0, params.amplitude), ampCap);

  // Vertical ribbing is the only z-invariant finish (unless domain-warped).
  const needsZResolution =
    !isSmooth &&
    !(
      params.surfacing === "ribbing" &&
      params.ribOrientation === "vertical" &&
      params.distortion === 0
    );

  const taperBand = clamp(H * 0.12, 1.2, 4);

  // Target spacings — sample several times per feature pitch so finishes read
  // crisply, and keep corner facets fine even when smooth. Domain-warp hides
  // fine base detail, so coarsen the base as distortion rises to keep the heavy
  // (distortion + smoothing) path responsive.
  const distortF = 1 + 1.2 * params.distortion;
  const featureSpacing = isSmooth ? 0.45 : clamp((pitch / 8) * distortF, 0.15, 2.5);
  // Corner arcs need finer sampling than rib pitch alone — keeps rounds smooth.
  const cornerSpacing = r > 0 ? r / 20 : featureSpacing;
  let dsTarget = Math.min(featureSpacing, cornerSpacing);
  let dzTarget = isSmooth
    ? Math.max(1.2, taperBand / 3)
    : needsZResolution
      ? clamp((pitch / 8) * distortF, 0.15, 2.5)
      : clamp(taperBand / 3, 0.4, 1.5);
  if (isPreview) {
    dsTarget *= PREVIEW_DENSITY_SCALE;
    dzTarget *= PREVIEW_DENSITY_SCALE;
    if (needsZResolution) {
      dsTarget *= 1.5;
      dzTarget *= 1.5;
    }
  }

  const maxSideVerts = isPreview ? PREVIEW_MAX_SIDE_VERTS : MAX_SIDE_VERTS;
  const triBudget = isPreview ? PREVIEW_TRI_BUDGET : FINAL_TRI_BUDGET;

  const P = perimeterLength(halfL, halfW, r);
  let nPerim = Math.max(16, Math.ceil(P / dsTarget));
  const edgeBand = edgeO;
  const footBand = Math.max(edgeBand, taperBand);
  const edgeVertSpacing = edgeBand > 0 ? clamp(edgeBand / 8, 0.025, 0.35) : 0;
  const edgeSegs =
    edgeBand > 0 ? Math.max(4, Math.ceil(edgeBand / edgeVertSpacing)) : 0;
  const transitionBand = Math.max(0, footBand - edgeBand);
  const transSegs =
    transitionBand > 0.05
      ? Math.max(3, Math.ceil(transitionBand / clamp(transitionBand / 6, 0.2, 2)))
      : 0;
  const bodyHeight = Math.max(0, H - footBand);
  let nBodySeg = Math.max(2, Math.ceil(bodyHeight / dzTarget));

  let densityClamped = false;
  let smoothingClamped = false;
  const sideVertBudget = nPerim * (edgeSegs + transSegs + nBodySeg + 1);
  if (sideVertBudget > maxSideVerts) {
    const f = Math.sqrt(maxSideVerts / sideVertBudget);
    nPerim = Math.max(16, Math.floor(nPerim * f));
    nBodySeg = Math.max(2, Math.floor(nBodySeg * f));
    densityClamped = true;
  }

  const garbage: Array<Manifold | CrossSection> = [];
  const keep = <T extends Manifold | CrossSection>(o: T): T => {
    garbage.push(o);
    return o;
  };
  /** Drop a manifold from garbage when it becomes the live result (not an intermediate). */
  const release = (m: Manifold): Manifold => {
    const i = garbage.indexOf(m);
    if (i >= 0) garbage.splice(i, 1);
    return m;
  };
  /** Free an intermediate manifold immediately to keep WASM memory in check. */
  const discard = (m: Manifold) => {
    const i = garbage.indexOf(m);
    if (i >= 0) garbage.splice(i, 1);
    m.delete();
  };

  const surfacingCfg = {
    type: params.surfacing,
    amplitude: effectiveAmplitude,
    pitch,
    orientation: params.ribOrientation,
    sharpness: params.sharpness,
    distortion: params.distortion,
  };

  const smoothLevel = isPreview ? 0 : params.smoothing;

  /** Refine only — pre-hollow smoothOut warps the cut surface and opens interior corners. */
  const densifyBeforeCut = (m: Manifold): Manifold => {
    if (isPreview) return m;
    const maxPasses = smoothLevel > 0 ? Math.min(2, smoothLevel) : 1;
    let work = m;
    for (let i = 0; i < maxPasses; i++) {
      if (work.numTri() >= SMOOTH_INPUT_TRI_MAX / 2) {
        if (smoothLevel > 0) smoothingClamped = true;
        break;
      }
      const next = work.refine(1);
      if (next.numTri() <= 0 || next.status() !== "NoError") {
        next.delete();
        break;
      }
      if (work !== m) discard(work);
      work = keep(next);
    }
    return work === m ? m : release(work);
  };

  /** G1-smooth after the boolean so interior 90° joints are not pre-warped. */
  const finishMesh = (m: Manifold, partTriBudget = triBudget): Manifold => {
    if (smoothLevel <= 0) return m;
    const baseTri = m.numTri();
    if (baseTri <= 0) return m;
    if (baseTri > SMOOTH_INPUT_TRI_MAX) {
      smoothingClamped = true;
      return m;
    }

    const smoothed = keep(m.smoothOut(SMOOTH_MIN_ANGLE, 0));
    const n = Math.min(
      smoothLevel + 1,
      Math.max(2, Math.floor(Math.sqrt(partTriBudget / baseTri))),
    );
    if (n < 2) return release(smoothed);

    const refined = smoothed.refine(n);
    if (refined.numTri() > partTriBudget || refined.status() !== "NoError") {
      refined.delete();
      return release(smoothed);
    }
    return keep(refined);
  };

  // 1 + 2. Outer rounded box, side walls warped with the finish.
  const outerSpacing = perimSpacing(halfL, halfW, r, nPerim);
  const outerCorners = cornerMinSegs(r, outerSpacing);
  const outerCS = keep(
    new CrossSection(roundedRectPoints(halfL, halfW, r, outerSpacing, outerCorners)),
  );
  let outer = keep(extrudeWithFootBand(outerCS, H, footBand, edgeBand, dzTarget));
  outer = breakCapFans(outer, keep, discard, isPreview ? 1 : 2);

  // 2b. Optional mounting flange — unioned before warp so draft + surfacing
  // displace wall and rim together (avoids a floating lip gap at the junction).
  const flangeW = Math.max(0, params.flangeWidth);
  const flangeT = clamp(params.flangeThickness, 1, 20);
  const hasFlange = flangeW > 0.05;
  const topZ = H + (hasFlange ? flangeT : 0);
  // Post-warp outer footprint (stats / lid plate).
  const wallTopHalfL = halfL + taperTop;
  const wallTopHalfW = halfW + taperTop;
  const wallTopR = Math.max(0.1, r + taperTop);
  const topHalfL = hasFlange ? wallTopHalfL + flangeW : wallTopHalfL;
  const topHalfW = hasFlange ? wallTopHalfW + flangeW : wallTopHalfW;
  const topR = hasFlange ? wallTopR + flangeW : wallTopR;

  let solid: Manifold = outer;
  if (hasFlange) {
    const flangeOuterHalfL = halfL + flangeW;
    const flangeOuterHalfW = halfW + flangeW;
    const flangeOuterR = r + flangeW;
    const flangeSpacing = perimSpacing(flangeOuterHalfL, flangeOuterHalfW, flangeOuterR, nPerim);
    const flangeCorners = cornerMinSegs(flangeOuterR, flangeSpacing);
    const wallSpacing = perimSpacing(halfL, halfW, r, nPerim);
    const wallCorners = cornerMinSegs(r, wallSpacing);
    const flangeSeg = Math.max(2, Math.ceil(flangeT / Math.min(dzTarget, flangeT / 3)));
    const flangeOuterCS = keep(
      new CrossSection(
        roundedRectPoints(
          flangeOuterHalfL,
          flangeOuterHalfW,
          flangeOuterR,
          flangeSpacing,
          flangeCorners,
        ),
      ),
    );
    const flangeInnerCS = keep(
      new CrossSection(roundedRectPoints(halfL, halfW, r, wallSpacing, wallCorners)),
    );
    const flangeOuter = keep(flangeOuterCS.extrude(flangeT + FLANGE_WELD, flangeSeg));
    const flangeInner = keep(
      flangeInnerCS.extrude(flangeT + FLANGE_WELD * 2, flangeSeg).translate(0, 0, -FLANGE_WELD),
    );
    const flangeRing = keep(
      flangeOuter.subtract(flangeInner).translate(0, 0, H - FLANGE_WELD),
    );
    solid = keep(outer.add(flangeRing));
    discard(outer);
  }

  const outerSurfaced = keep(
    solid.warpBatch(
      makeWarp(surfacingCfg, {
        halfL,
        halfW,
        r,
        zMin: 0,
        zMax: topZ,
        surfacingMaxZ: H,
        taperBand,
        draftTan,
        baseEdgeType: edgeType,
        baseEdgeSize: edgeO,
        topEdgeType,
        topEdgeSize: topEdgeO,
        topEdgeZ: H,
        topEdgeBrim: hasFlange,
        profileBaseZ: 0,
      }),
    ),
  );
  solid = outerSurfaced;

  // 3. Smooth inner cavity -> subtract to hollow + leave a floor.
  // The opening runs all the way up through the flange.
  const innerHalfL = halfL - t;
  const innerHalfW = halfW - t;
  const innerR = clampRadius(innerHalfL, innerHalfW, Math.max(0, r - t));
  // topZ computed above with flange
  // Match the outer wall mesh density so the boolean cut leaves a clean interior
  // instead of coarse facets that smoothOut/refine would later fold into shards.
  const innerP = perimeterLength(innerHalfL, innerHalfW, innerR);
  const cavitySpacing = innerP / nPerim;
  const cavityCorners = cornerMinSegs(innerR, cavitySpacing);
  const cavityFloorZ = floorT + CAVITY_FLOOR_LIFT;
  const cavityH = topZ - cavityFloorZ + 2;
  const cavitySeg = Math.max(6, Math.ceil(cavityH / dzTarget));
  const cavityProfile = keep(
    new CrossSection(
      roundedRectPoints(innerHalfL, innerHalfW, innerR, cavitySpacing, cavityCorners),
    ),
  );
  const cavityShrunk =
    CAVITY_INSET > 0
      ? keep(cavityProfile.offset(-CAVITY_INSET, "Round", 2, Math.max(8, cavityCorners)))
      : cavityProfile;
  let cavity = keep(
    cavityShrunk.extrude(cavityH, cavitySeg - 1).translate(0, 0, cavityFloorZ),
  );
  cavity = breakCapFans(cavity, keep, discard, 1);
  // Interior: same draft + base edge as the exterior, measured from the same
  // global base (profileBaseZ 0) so the wall stays constant-thickness.
  const innerEdgeMax = Math.min(innerHalfL, innerHalfW) * 0.48;
  // Inner edge tracks the outer (same profile, same base) so the wall stays
  // constant-thickness through the band — clamped by the inner footprint and the
  // inner corner radius (so the cavity corners can't invert), never by wall
  // thickness (that would pinch the foot for any visible fillet).
  const innerCornerCap = innerR > 0.5 ? innerR : innerEdgeMax;
  // Independent interior wall→floor fillet (#25): rounds the inside bottom for
  // strength/cleanability even when the exterior foot is sharp. Takes the larger
  // of the outer-coupled edge and the requested interior fillet.
  const interiorFilletC = Math.min(
    Math.max(0, params.interiorFillet),
    innerEdgeMax,
    innerCornerCap,
    H * 0.48,
  );
  const edgeI = Math.min(
    Math.max(edgeO, interiorFilletC),
    innerEdgeMax,
    innerCornerCap,
    H * 0.48,
  );
  // Use a fillet when the interior fillet drives the size; else match the exterior.
  const innerEdgeType: typeof edgeType =
    interiorFilletC > edgeO ? "fillet" : edgeType;
  if (draftTan !== 0 || edgeI > 0) {
    cavity = keep(
      cavity.warpBatch(
        makeWarp(
          {
            type: "smooth",
            amplitude: 0,
            pitch,
            orientation: params.ribOrientation,
            sharpness: params.sharpness,
            distortion: params.distortion,
          },
          {
            halfL: innerHalfL,
            halfW: innerHalfW,
            r: innerR,
            zMin: cavityFloorZ,
            zMax: topZ + 2,
            taperBand: 0,
            draftTan,
            baseEdgeType: innerEdgeType,
            baseEdgeSize: edgeI,
            profileBaseZ: 0,
          },
        ),
      ),
    );
  }
  // Densify before the boolean (no smoothOut), hollow, then finish the exterior.
  const shell = densifyBeforeCut(solid);
  if (solid !== outerSurfaced && shell !== solid) solid.delete();
  const hollow = shell.subtract(cavity);
  discard(shell);
  const bodyFinished = finishMesh(hollow);
  let body = release(bodyFinished);

  // Base-floor options: recess the underside to a perimeter rim (#27) and/or
  // punch drainage holes through the floor (#34). Built as cutters and removed
  // in one boolean so the result stays a single watertight shell.
  {
    const cutters: Manifold[] = [];
    if (params.footRing) {
      const rim = Math.min(3, Math.min(halfL, halfW) * 0.25);
      const depth = 0.6;
      const fl = halfL - rim;
      const fw = halfW - rim;
      if (fl > 2 && fw > 2) {
        const fr = clampRadius(fl, fw, Math.max(0, r - rim));
        const recessCS = new CrossSection(
          roundedRectPoints(fl, fw, fr, Math.max(fl, fw) / 40, 16),
        );
        cutters.push(recessCS.extrude(depth + 1).translate(0, 0, -1));
        recessCS.delete();
      }
    }
    if (params.drainHoles && params.drainHoleDiameter >= 1.5) {
      const rad = params.drainHoleDiameter / 2;
      const margin = t + 3 + rad;
      const usableL = Math.max(0, (innerHalfL - margin) * 2);
      const usableW = Math.max(0, (innerHalfW - margin) * 2);
      const spacing = Math.max(params.drainHoleDiameter * 2, params.drainHoleDiameter + 6);
      const nx = Math.min(8, Math.max(1, Math.floor(usableL / spacing) + 1));
      const ny = Math.min(8, Math.max(1, Math.floor(usableW / spacing) + 1));
      const stepX = nx > 1 ? usableL / (nx - 1) : 0;
      const stepY = ny > 1 ? usableW / (ny - 1) : 0;
      const holeH = floorT + CAVITY_FLOOR_LIFT + 3;
      for (let i = 0; i < nx; i++) {
        for (let j = 0; j < ny; j++) {
          const cx = (nx > 1 ? -usableL / 2 + i * stepX : 0);
          const cy = (ny > 1 ? -usableW / 2 + j * stepY : 0);
          cutters.push(
            CrossSection.circle(rad, 24).extrude(holeH).translate(cx, cy, -1),
          );
        }
      }
    }
    if (cutters.length) {
      let cut = cutters[0];
      for (let i = 1; i < cutters.length; i++) {
        const u = cut.add(cutters[i]);
        cut.delete();
        cutters[i].delete();
        cut = u;
      }
      const drilled = body.subtract(cut);
      cut.delete();
      body.delete();
      body = drilled;
    }
  }

  if (body.status() !== "NoError" || body.isEmpty()) {
    body.delete();
    throw new Error(`Body boolean failed (${body.status()})`);
  }

  const watertight = body.status() === "NoError" && !body.isEmpty();
  // Optional uniform up-scale so the printed part lands on-size after the
  // material shrinks as it cools (#12). <1.5% — preview reads the same.
  const shrink = params.compensateShrink ? shrinkScale(params.material) : 1;
  const bodyScaled = shrink !== 1 ? body.scale([shrink, shrink, shrink]) : body;
  if (bodyScaled !== body) body.delete();
  const bodyVolume = bodyScaled.volume();
  const bodyMesh = bodyScaled.getMesh();
  const bodyPart = meshToPart(bodyMesh);
  bodyScaled.delete();

  // 4. Matching friction-fit lid.
  let lidPart: GeneratedPart | null = null;
  let lidTriangles = 0;
  let lidVolume = 0;
  if (params.includeLid) {
    const clearance = clamp(params.lidClearance, 0, 1); // press-fit gap (mm)
    const lipWall = Math.min(t, 2.0);
    const lipH = Math.min(Math.max(0, params.lidLipHeight), (H - floorT) * 0.85);
    const plateT = Math.max(t * 1.5, 1.2);

    // Plate footprint matches the body top (flange) exactly so it sits flush.
    const plateSpacing = perimSpacing(topHalfL, topHalfW, topR, nPerim);
    const plateCorners = cornerMinSegs(topR, plateSpacing);
    const plateCS = keep(
      new CrossSection(
        roundedRectPoints(topHalfL, topHalfW, topR, plateSpacing, plateCorners),
      ),
    );
    const plateSeg = Math.max(2, Math.ceil(plateT / Math.max(0.6, dzTarget)));
    const plateRaw = keep(plateCS.extrude(plateT, plateSeg - 1));
    // The lid is a clean smooth plate that matches by footprint + flange coverage.
    // Algorithmic surfacing on its thin (~plateT) edge scallops badly — the rib
    // pitch dwarfs the band height — so it is intentionally omitted here.
    const plate = breakCapFans(plateRaw, keep, discard, 1);

    // Plug ring: fits inside the opening with clearance, hangs below the plate.
    // The lid plugs into the opening at the (tapered) top of the cavity.
    const lipOL = innerHalfL + taperTop - clearance;
    const lipOW = innerHalfW + taperTop - clearance;
    const lipOR = clampRadius(lipOL, lipOW, Math.max(0, innerR + taperTop - clearance));
    const lipIL = lipOL - lipWall;
    const lipIW = lipOW - lipWall;

    let lid: Manifold;
    if (lipH >= 1.5 && lipIL > 1 && lipIW > 1) {
      const lipIR = clampRadius(lipIL, lipIW, Math.max(0, lipOR - lipWall));
      const lipSpacing = perimSpacing(lipOL, lipOW, lipOR, nPerim);
      const lipCorners = cornerMinSegs(lipOR, lipSpacing);
      const lipInnerSpacing = perimSpacing(lipIL, lipIW, lipIR, nPerim);
      const lipInnerCorners = cornerMinSegs(lipIR, lipInnerSpacing);
      const lipSeg = Math.max(2, Math.ceil(lipH / Math.min(dzTarget, lipH / 3)));
      const lipOuterCS = keep(
        new CrossSection(
          roundedRectPoints(lipOL, lipOW, lipOR, lipSpacing, lipCorners),
        ),
      );
      const lipInnerCS = keep(
        new CrossSection(
          roundedRectPoints(lipIL, lipIW, lipIR, lipInnerSpacing, lipInnerCorners),
        ),
      );
      const lipOuter = keep(lipOuterCS.extrude(lipH, lipSeg - 1));
      const lipInner = keep(
        lipInnerCS.extrude(lipH + 2, lipSeg - 1).translate(0, 0, -1),
      );
      const lipRing = keep(lipOuter.subtract(lipInner).translate(0, 0, -lipH));
      lid = keep(plate.add(lipRing));
    } else {
      // Walls too thin for a ring — fall back to a plate-only lid.
      lid = plate;
    }

    const lidSmoothed = finishMesh(lid, Math.floor(triBudget / 3));
    const lidReleased = release(lidSmoothed);
    const lidFinal =
      shrink !== 1 ? lidReleased.scale([shrink, shrink, shrink]) : lidReleased;
    if (lidFinal !== lidReleased) lidReleased.delete();
    lidVolume = lidFinal.volume();
    const lidMesh = lidFinal.getMesh();
    lidPart = meshToPart(lidMesh);
    lidTriangles = lidPart.triangleCount;
    lidFinal.delete();
  }

  const topology = analyzeTopology(bodyPart.positions, bodyPart.indices, topZ);
  const outerDims = bbox(bodyPart.positions);
  // Minimum cutout the walls must pass through (widest point: taper + surfacing).
  const maxTaper = Math.max(0, taperTop);
  const cutout: [number, number] = [
    L + 2 * maxTaper + 2 * effectiveAmplitude,
    W + 2 * maxTaper + 2 * effectiveAmplitude,
  ];

  for (const o of garbage) o.delete();

  return {
    body: bodyPart,
    lid: lidPart,
    stats: {
      bodyTriangles: bodyPart.triangleCount,
      lidTriangles,
      bodyVolume,
      lidVolume,
      outerDims,
      cutout,
      watertight:
        watertight &&
        topology.nonManifoldEdges === 0 &&
        topology.defectEdges === 0,
      nakedEdges: topology.nakedEdges,
      rimEdges: topology.rimEdges,
      defectEdges: topology.defectEdges,
      nonManifoldEdges: topology.nonManifoldEdges,
      genMs: performance.now() - t0,
      effectiveAmplitude,
      densityClamped,
      smoothingClamped,
      preview: isPreview,
    },
  };
}
