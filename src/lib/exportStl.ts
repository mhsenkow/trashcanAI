"use client";

// Finalises a generated part into a binary STL and triggers a browser download.
// The mesh is already watertight (manifold guarantees it); we only need to wrap
// the buffers in a THREE.Mesh for the exporter.

import * as THREE from "three";
import { mergeVertices, toCreasedNormals } from "three-stdlib";
import { STLExporter } from "three-stdlib";
import type { GeneratedPart } from "./types";

export function partToBufferGeometry(part: GeneratedPart): THREE.BufferGeometry {
  const positions = new Float32Array(part.positions);
  const indices = new Uint32Array(part.indices);
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geom.setIndex(new THREE.BufferAttribute(indices, 1));
  // Manifold emits split verts per triangle; weld + creased normals for clean shading.
  const welded = mergeVertices(geom, 1e-4);
  geom.dispose();
  const creased = toCreasedNormals(welded, Math.PI / 4);
  welded.dispose();
  return creased;
}

export function exportPartToStl(part: GeneratedPart, filename: string): void {
  const geom = partToBufferGeometry(part);
  const mesh = new THREE.Mesh(geom);
  const exporter = new STLExporter();
  const result = exporter.parse(mesh, { binary: true }) as unknown as DataView;

  const blob = new Blob([result as BlobPart], {
    type: "application/octet-stream",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".stl") ? filename : `${filename}.stl`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  geom.dispose();
}
