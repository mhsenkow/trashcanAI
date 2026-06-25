"use client";

// Re-exports mesh prep + STL; multi-format lives in exportFormats.ts.

import * as THREE from "three";
import { mergeVertices, toCreasedNormals } from "three-stdlib";
import { overhangColorsForGeometry } from "./geometry/overhangAnalysis";
import { wallThicknessColors } from "./geometry/wallThicknessAnalysis";
import type { GeneratedPart } from "./types";

export { exportPartToStl, exportPartTo3mf, exportPartToStep, exportToleranceStrip, exportTiledStl } from "./exportFormats";

export function partToBufferGeometry(
  part: GeneratedPart,
  options?: {
    overhangHeatmap?: boolean;
    wallHeatmap?: boolean;
    wallT?: number;
    halfL?: number;
    halfW?: number;
    layerStepMm?: number;
  },
): THREE.BufferGeometry {
  const positions = new Float32Array(part.positions);
  const indices = new Uint32Array(part.indices);
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geom.setIndex(new THREE.BufferAttribute(indices, 1));
  const welded = mergeVertices(geom, 1e-4);
  geom.dispose();
  const creased = toCreasedNormals(welded, Math.PI / 4);
  welded.dispose();

  const posAttr = creased.getAttribute("position") as THREE.BufferAttribute;
  const posArr = posAttr.array as Float32Array;
  if (options?.layerStepMm && options.layerStepMm > 0) {
    for (let i = 2; i < posArr.length; i += 3) {
      posArr[i] = Math.round(posArr[i] / options.layerStepMm) * options.layerStepMm;
    }
    posAttr.needsUpdate = true;
  }

  const idx = creased.getIndex();
  if (idx) {
    if (options?.overhangHeatmap) {
      const colors = overhangColorsForGeometry(posArr, idx.array as Uint32Array);
      creased.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    } else if (
      options?.wallHeatmap &&
      options.wallT &&
      options.halfL &&
      options.halfW
    ) {
      const colors = wallThicknessColors(
        posArr,
        options.halfL,
        options.halfW,
        options.wallT,
      );
      creased.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    }
  }

  return creased;
}
