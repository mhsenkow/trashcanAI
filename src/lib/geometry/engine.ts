// The geometry engine.
//
// Pipeline (all via manifold3d so output is guaranteed watertight):
//   1. Build the outer rounded box as a high-density extrusion.
//   2. Warp its side walls outward with the chosen finish (exterior only).
//   2b. Optionally add an outward mounting flange at the top rim.
//   3. Subtract a smooth inner cavity -> hollow body with a flat floor + rim.
//   4. Optionally build a matching friction-fit lid (solid plate + plug ring).

import type { CrossSection, Manifold, ManifoldToplevel, Mesh } from "manifold-3d";
import { clampRadius, perimeterLength, roundedRectPoints } from "./profile";
import { makeWarp } from "./surfacing";
import type {
  GeneratedGeometry,
  GeneratedPart,
  ReceptacleParams,
} from "../types";

// Soft cap on side-wall vertices so pathological pitch/size combos can't melt
// the browser. When exceeded, horizontal & vertical density are scaled down
// together and the UI is told the mesh was coarsened.
const MAX_SIDE_VERTS = 650_000;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function meshToPart(mesh: Mesh): GeneratedPart {
  const { numProp, vertProperties, triVerts } = mesh;
  const vertCount = vertProperties.length / numProp;

  // Copy out of the WASM-backed views into JS-owned, transferable buffers.
  let positions: Float32Array;
  if (numProp === 3) {
    positions = new Float32Array(vertProperties);
  } else {
    positions = new Float32Array(vertCount * 3);
    for (let i = 0; i < vertCount; i++) {
      positions[i * 3] = vertProperties[i * numProp];
      positions[i * 3 + 1] = vertProperties[i * numProp + 1];
      positions[i * 3 + 2] = vertProperties[i * numProp + 2];
    }
  }
  const indices = new Uint32Array(triVerts);
  return { positions, indices, triangleCount: indices.length / 3 };
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
  const floorT = t;

  const isSmooth = params.surfacing === "smooth";
  const pitch = Math.max(0.6, params.featureScale);
  // Outward-only displacement clamped so adjacent ribs/bumps can never fold the
  // surface onto itself (keeps the warped manifold geometrically valid).
  const effectiveAmplitude = isSmooth
    ? 0
    : Math.min(Math.max(0, params.amplitude), 0.45 * pitch);

  const needsZResolution =
    params.surfacing === "knurling" ||
    params.surfacing === "noise" ||
    (params.surfacing === "ribbing" && params.ribOrientation === "horizontal");

  const taperBand = clamp(H * 0.12, 1.2, 4);

  // Target spacings. We sample several times per feature pitch so finishes read
  // crisply, and keep corner facets fine even when smooth. Counts are then
  // clamped against the vertex budget.
  const dsTarget = isSmooth ? 0.8 : clamp(pitch / 6, 0.2, 2);
  const dzTarget = isSmooth
    ? Math.max(1.5, taperBand / 2)
    : needsZResolution
      ? clamp(pitch / 6, 0.2, 2)
      : clamp(taperBand / 2, 0.5, 2);

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

  // 1 + 2. Outer rounded box, side walls warped with the finish.
  const outerCS = keep(new CrossSection(roundedRectPoints(halfL, halfW, r, P / nPerim)));
  const outer = keep(outerCS.extrude(H, nSeg - 1));
  const warpOuter = makeWarp(
    {
      type: params.surfacing,
      amplitude: effectiveAmplitude,
      pitch,
      orientation: params.ribOrientation,
    },
    { halfL, halfW, r, zMin: 0, zMax: H, taperBand },
  );
  const outerSurfaced = keep(outer.warpBatch(warpOuter));

  // 2b. Optional outward mounting flange at the top rim, so the receptacle can
  // drop into a cutout and hang by the flange resting on the edge. The top
  // footprint (flange when present, otherwise the walls) is what the lid covers.
  const flangeW = Math.max(0, params.flangeWidth);
  const flangeT = clamp(params.flangeThickness, 1, 20);
  const hasFlange = flangeW > 0.05;
  const topHalfL = hasFlange ? halfL + flangeW : halfL;
  const topHalfW = hasFlange ? halfW + flangeW : halfW;
  const topR = hasFlange ? r + flangeW : r;

  let solid = outerSurfaced;
  if (hasFlange) {
    const flangeCS = keep(
      new CrossSection(roundedRectPoints(topHalfL, topHalfW, topR, 1.0, 16)),
    );
    const flange = keep(flangeCS.extrude(flangeT, 1).translate(0, 0, H));
    solid = keep(solid.add(flange));
  }

  // 3. Smooth inner cavity (un-warped) -> subtract to hollow + leave a floor.
  // The opening runs all the way up through the flange.
  const innerHalfL = halfL - t;
  const innerHalfW = halfW - t;
  const innerR = clampRadius(innerHalfL, innerHalfW, Math.max(0, r - t));
  const topZ = H + (hasFlange ? flangeT : 0);
  const cavityCS = keep(
    new CrossSection(roundedRectPoints(innerHalfL, innerHalfW, innerR, 1.0, 16)),
  );
  const cavity = keep(
    cavityCS.extrude(topZ - floorT + 2, 1).translate(0, 0, floorT),
  );
  const body = keep(solid.subtract(cavity));

  const bodyMesh = body.getMesh();
  const bodyPart = meshToPart(bodyMesh);

  // 4. Matching friction-fit lid.
  let lidPart: GeneratedPart | null = null;
  let lidTriangles = 0;
  if (params.includeLid) {
    const clearance = 0.25; // press-fit gap (mm)
    const lipWall = Math.min(t, 2.0);
    const lipH = clamp(H * 0.18, 4, 12);
    const plateT = Math.max(t * 1.5, 2.4);
    const lidTaper = Math.min(plateT * 0.25, taperBand);

    // Plate footprint matches the body top (flange) exactly so it sits flush.
    const plateCS = keep(
      new CrossSection(roundedRectPoints(topHalfL, topHalfW, topR, dsTarget)),
    );
    const plateSeg = Math.max(2, Math.ceil(plateT / Math.max(0.6, dzTarget)));
    const plateRaw = keep(plateCS.extrude(plateT, plateSeg - 1));
    const warpPlate = makeWarp(
      {
        type: params.surfacing,
        amplitude: effectiveAmplitude,
        pitch,
        orientation: params.ribOrientation,
      },
      {
        halfL: topHalfL,
        halfW: topHalfW,
        r: topR,
        zMin: 0,
        zMax: plateT,
        taperBand: lidTaper,
      },
    );
    const plate = keep(plateRaw.warpBatch(warpPlate));

    // Plug ring: fits inside the opening with clearance, hangs below the plate.
    const lipOL = innerHalfL - clearance;
    const lipOW = innerHalfW - clearance;
    const lipOR = clampRadius(lipOL, lipOW, Math.max(0, innerR - clearance));
    const lipIL = lipOL - lipWall;
    const lipIW = lipOW - lipWall;

    let lid: Manifold;
    if (lipIL > 1 && lipIW > 1) {
      const lipIR = clampRadius(lipIL, lipIW, Math.max(0, lipOR - lipWall));
      const lipOuterCS = keep(
        new CrossSection(roundedRectPoints(lipOL, lipOW, lipOR, 1.0, 16)),
      );
      const lipInnerCS = keep(
        new CrossSection(roundedRectPoints(lipIL, lipIW, lipIR, 1.0, 16)),
      );
      const lipOuter = keep(lipOuterCS.extrude(lipH, 1));
      const lipInner = keep(lipInnerCS.extrude(lipH + 2, 1).translate(0, 0, -1));
      const lipRing = keep(lipOuter.subtract(lipInner).translate(0, 0, -lipH));
      lid = keep(plate.add(lipRing));
    } else {
      // Walls too thin for a ring — fall back to a plate-only lid.
      lid = plate;
    }

    const lidMesh = lid.getMesh();
    lidPart = meshToPart(lidMesh);
    lidTriangles = lidPart.triangleCount;
  }

  const watertight = body.status() === "NoError" && !body.isEmpty();
  const outerDims = bbox(bodyPart.positions);
  // Minimum cutout the walls must pass through (nominal wall + outward surfacing).
  const cutout: [number, number] = [
    L + 2 * effectiveAmplitude,
    W + 2 * effectiveAmplitude,
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
      genMs: performance.now() - t0,
      effectiveAmplitude,
      densityClamped,
    },
  };
}
