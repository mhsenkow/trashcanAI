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
import { makeWarp } from "./surfacing";
import type {
  GeneratedGeometry,
  GeneratedPart,
  ReceptacleParams,
} from "../types";

// Soft cap on base side-wall vertices so pathological pitch/size combos can't
// melt the browser; horizontal & vertical density scale down together.
const MAX_SIDE_VERTS = 900_000;
// Cap on the post-subdivision triangle count (smoothing refine is clamped to it).
const FINAL_TRI_BUDGET = 2_500_000;
// Post-hollow smoothOut threshold (deg). Interior 90° corners stay crisp; ribs still soften.
const SMOOTH_MIN_ANGLE = 86;
// Lift cavity bottom above the floor slab so the cutter cap does not notch floor corners.
const CAVITY_FLOOR_LIFT = 0.35;
// Shrink cavity profile slightly so the boolean leaves a hair of wall at interior corners.
const CAVITY_INSET = 0.12;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Quarter-circle segments so corner arcs stay visually smooth at `spacing` mm. */
function cornerMinSegs(radius: number, spacing: number): number {
  if (radius < 0.05) return 8;
  const arcLen = (Math.PI / 2) * radius;
  return Math.min(40, Math.max(12, Math.ceil(arcLen / Math.max(spacing, 0.05))));
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
): GeneratedGeometry {
  const t0 = performance.now();
  const { CrossSection } = wasm;

  const L = params.length;
  const W = params.width;
  const H = params.height;
  const halfL = L / 2;
  const halfW = W / 2;
  const t = clamp(params.wallThickness, 0.8, Math.min(halfL, halfW) - 0.5);
  const r = clampRadius(halfL, halfW, params.cornerRadius);
  const floorT = clamp(params.floorThickness, 0.8, H - 2);

  // Wall draft + bottom fillet are height-dependent radial offsets in the warp.
  const maxTan = (Math.min(halfL, halfW) * 0.8) / H;
  const draftTan = clamp(Math.tan((params.wallDraft * Math.PI) / 180), -maxTan, maxTan);
  const taperTop = H * draftTan;
  const filletO = Math.max(
    0,
    Math.min(params.bottomFillet, r * 0.98, halfL * 0.9, halfW * 0.9, H * 0.45),
  );

  const isSmooth = params.surfacing === "smooth";
  const pitch = Math.max(0.6, params.featureScale);
  // Outward-only displacement clamped so adjacent features can never fold the
  // surface onto itself (keeps the warped manifold geometrically valid).
  const effectiveAmplitude = isSmooth
    ? 0
    : Math.min(Math.max(0, params.amplitude), 0.45 * pitch);

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
  const dsTarget = Math.min(featureSpacing, cornerSpacing);
  const dzTarget = isSmooth
    ? Math.max(1.2, taperBand / 3)
    : needsZResolution
      ? clamp((pitch / 8) * distortF, 0.15, 2.5)
      : clamp(taperBand / 3, 0.4, 1.5);

  const P = perimeterLength(halfL, halfW, r);
  let nPerim = Math.max(16, Math.ceil(P / dsTarget));
  let nSeg = Math.max(4, Math.ceil(H / dzTarget));

  let densityClamped = false;
  if (nPerim * (nSeg + 1) > MAX_SIDE_VERTS) {
    const f = Math.sqrt(MAX_SIDE_VERTS / (nPerim * (nSeg + 1)));
    nPerim = Math.max(16, Math.floor(nPerim * f));
    nSeg = Math.max(4, Math.floor(nSeg * f));
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

  const smoothLevel = params.smoothing;

  /** Refine only — pre-hollow smoothOut warps the cut surface and opens interior corners. */
  const densifyBeforeCut = (m: Manifold): Manifold => {
    const passes = smoothLevel > 0 ? Math.min(2, smoothLevel) : 1;
    let work = m;
    for (let i = 0; i < passes; i++) {
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
  const finishMesh = (m: Manifold, triBudget = FINAL_TRI_BUDGET): Manifold => {
    if (smoothLevel <= 0) return m;
    const baseTri = m.numTri();
    if (baseTri <= 0) return m;

    const smoothed = keep(m.smoothOut(SMOOTH_MIN_ANGLE, 0));
    const n = Math.min(
      smoothLevel + 1,
      Math.max(2, Math.floor(Math.sqrt(triBudget / baseTri))),
    );
    if (n < 2) return release(smoothed);

    const refined = smoothed.refine(n);
    if (refined.numTri() > triBudget || refined.status() !== "NoError") {
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
  let outer = keep(outerCS.extrude(H, nSeg - 1));
  outer = breakCapFans(outer, keep, discard, 2);
  const outerSurfaced = keep(
    outer.warpBatch(
      makeWarp(surfacingCfg, {
        halfL,
        halfW,
        r,
        zMin: 0,
        zMax: H,
        taperBand,
        draftTan,
        bottomFillet: filletO,
      }),
    ),
  );

  // 2b. Optional outward mounting flange at the top rim, so the receptacle can
  // drop into a cutout and hang by the flange resting on the edge. The top
  // footprint (flange when present, otherwise the walls) is what the lid covers.
  const flangeW = Math.max(0, params.flangeWidth);
  const flangeT = clamp(params.flangeThickness, 1, 20);
  const hasFlange = flangeW > 0.05;
  // The walls' outer footprint at the top, after taper.
  const wallTopHalfL = halfL + taperTop;
  const wallTopHalfW = halfW + taperTop;
  const wallTopR = Math.max(0.1, r + taperTop);
  const topHalfL = hasFlange ? wallTopHalfL + flangeW : wallTopHalfL;
  const topHalfW = hasFlange ? wallTopHalfW + flangeW : wallTopHalfW;
  const topR = hasFlange ? wallTopR + flangeW : wallTopR;

  let solid: Manifold = outerSurfaced;
  if (hasFlange) {
    const flangeSpacing = perimSpacing(topHalfL, topHalfW, topR, nPerim);
    const flangeCorners = cornerMinSegs(topR, flangeSpacing);
    const wallTopSpacing = perimSpacing(wallTopHalfL, wallTopHalfW, wallTopR, nPerim);
    const wallTopCorners = cornerMinSegs(wallTopR, wallTopSpacing);
    const flangeSeg = Math.max(2, Math.ceil(flangeT / Math.min(dzTarget, flangeT / 3)));
    const flangeOuterCS = keep(
      new CrossSection(
        roundedRectPoints(topHalfL, topHalfW, topR, flangeSpacing, flangeCorners),
      ),
    );
    const flangeInnerCS = keep(
      new CrossSection(
        roundedRectPoints(
          wallTopHalfL,
          wallTopHalfW,
          wallTopR,
          wallTopSpacing,
          wallTopCorners,
        ),
      ),
    );
    const flangeOuter = keep(flangeOuterCS.extrude(flangeT, flangeSeg - 1));
    const flangeInner = keep(
      flangeInnerCS.extrude(flangeT + 2, flangeSeg - 1).translate(0, 0, -1),
    );
    const flangeRing = keep(
      flangeOuter.subtract(flangeInner).translate(0, 0, H),
    );
    solid = outerSurfaced.add(flangeRing);
  }

  // 3. Smooth inner cavity -> subtract to hollow + leave a floor.
  // The opening runs all the way up through the flange.
  const innerHalfL = halfL - t;
  const innerHalfW = halfW - t;
  const innerR = clampRadius(innerHalfL, innerHalfW, Math.max(0, r - t));
  const topZ = H + (hasFlange ? flangeT : 0);
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
  // Interior: draft only (no fillet — fillet on the cutter folds floor corners).
  if (draftTan !== 0) {
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
          },
        ),
      ),
    );
  }
  // Densify before the boolean (no smoothOut), hollow, then finish the exterior.
  const shell = densifyBeforeCut(solid);
  if (solid !== outerSurfaced) solid.delete();
  const hollow = shell.subtract(cavity);
  discard(shell);
  const bodyFinished = finishMesh(hollow);
  const body = release(bodyFinished);

  if (body.status() !== "NoError" || body.isEmpty()) {
    body.delete();
    throw new Error(`Body boolean failed (${body.status()})`);
  }

  const watertight = body.status() === "NoError" && !body.isEmpty();
  const bodyMesh = body.getMesh();
  const bodyPart = meshToPart(bodyMesh);
  body.delete();

  // 4. Matching friction-fit lid.
  let lidPart: GeneratedPart | null = null;
  let lidTriangles = 0;
  if (params.includeLid) {
    const clearance = clamp(params.lidClearance, 0, 1); // press-fit gap (mm)
    const lipWall = Math.min(t, 2.0);
    const lipH = Math.min(Math.max(0, params.lidLipHeight), (H - floorT) * 0.85);
    const plateT = Math.max(t * 1.5, 2.4);
    const lidTaper = Math.min(plateT * 0.25, taperBand);

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
    const plate = keep(
      plateRaw.warpBatch(
        makeWarp(surfacingCfg, {
          halfL: topHalfL,
          halfW: topHalfW,
          r: topR,
          zMin: 0,
          zMax: plateT,
          taperBand: lidTaper,
        }),
      ),
    );

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

    const lidSmoothed = finishMesh(lid, Math.floor(FINAL_TRI_BUDGET / 3));
    const lidFinal = release(lidSmoothed);
    const lidMesh = lidFinal.getMesh();
    lidPart = meshToPart(lidMesh);
    lidTriangles = lidPart.triangleCount;
    lidFinal.delete();
  }

  const topology = analyzeTopology(bodyPart.indices);
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
      outerDims,
      cutout,
      watertight,
      nakedEdges: topology.nakedEdges,
      genMs: performance.now() - t0,
      effectiveAmplitude,
      densityClamped,
    },
  };
}
