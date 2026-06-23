"use client";

// Finalises a generated part into a binary STL and triggers a browser download.
// The mesh is already watertight (manifold guarantees it); we only need to wrap
// the buffers in a THREE.Mesh for the exporter.

import * as THREE from "three";
import { STLExporter } from "three-stdlib";
import type { GeneratedPart } from "./types";

export function partToBufferGeometry(part: GeneratedPart): THREE.BufferGeometry {
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(part.positions, 3));
  geom.setIndex(new THREE.BufferAttribute(part.indices, 1));
  geom.computeVertexNormals();
  return geom;
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
