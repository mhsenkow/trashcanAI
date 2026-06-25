"use client";

// Multi-format export (#9) and tolerance test strip (#16).

import type { GeneratedPart, ReceptacleParams } from "./types";
import { fitClearance, MATERIALS, type FitClass } from "./printProfiles";
import { partToBufferGeometry } from "./exportStl";
import * as THREE from "three";
import { STLExporter } from "three-stdlib";

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function meshFromPart(part: GeneratedPart): THREE.Mesh {
  const geom = partToBufferGeometry(part);
  const mesh = new THREE.Mesh(geom);
  return mesh;
}

export function exportPartToStl(part: GeneratedPart, filename: string): void {
  const mesh = meshFromPart(part);
  const exporter = new STLExporter();
  const result = exporter.parse(mesh, { binary: true }) as unknown as DataView;
  downloadBlob(new Blob([result as BlobPart], { type: "application/octet-stream" }), filename.endsWith(".stl") ? filename : `${filename}.stl`);
  (mesh.geometry as THREE.BufferGeometry).dispose();
}

/** Minimal 3MF (mesh-only) for slicers that prefer project files. */
export function exportPartTo3mf(part: GeneratedPart, filename: string): void {
  const pos = part.positions;
  const idx = part.indices;
  const verts: string[] = [];
  for (let i = 0; i < pos.length; i += 3) {
    verts.push(`<vertex x="${pos[i]}" y="${pos[i + 1]}" z="${pos[i + 2]}" />`);
  }
  const tris: string[] = [];
  for (let i = 0; i < idx.length; i += 3) {
    tris.push(
      `<triangle v1="${idx[i]}" v2="${idx[i + 1]}" v3="${idx[i + 2]}" />`,
    );
  }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <resources>
    <object id="1" type="model">
      <mesh>
        <vertices>${verts.join("")}</vertices>
        <triangles>${tris.join("")}</triangles>
      </mesh>
    </object>
  </resources>
  <build>
    <item objectid="1" />
  </build>
</model>`;
  downloadBlob(new Blob([xml], { type: "application/vnd.ms-package.3dmanufacturing-3dmodel+xml" }), filename.endsWith(".3mf") ? filename : `${filename}.3mf`);
}

/** Faceted STEP (AP214) — triangle soup for CAD import. */
export function exportPartToStep(part: GeneratedPart, filename: string): void {
  const pos = part.positions;
  const idx = part.indices;
  const lines: string[] = [
    "ISO-10303-21;",
    "HEADER;",
    "FILE_DESCRIPTION(('Receptacle export'),'2;1');",
    "FILE_NAME('receptacle.stp','',(''),(''),'','','');",
    "FILE_SCHEMA(('AUTOMOTIVE_DESIGN'));",
    "ENDSEC;",
    "DATA;",
  ];
  let id = 1;
  const ref = (n: number) => `#${n}`;
  const cart = () => id++;
  const dir = () => id++;
  const face = () => id++;
  const shell = () => id++;
  const manifold = () => id++;
  const product = () => id++;

  const triCount = idx.length / 3;
  const faceIds: number[] = [];
  for (let t = 0; t < triCount; t++) {
    const ia = idx[t * 3];
    const ib = idx[t * 3 + 1];
    const ic = idx[t * 3 + 2];
    const ax = pos[ia * 3], ay = pos[ia * 3 + 1], az = pos[ia * 3 + 2];
    const bx = pos[ib * 3], by = pos[ib * 3 + 1], bz = pos[ib * 3 + 2];
    const cx = pos[ic * 3], cy = pos[ic * 3 + 1], cz = pos[ic * 3 + 2];
    const nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
    const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    const nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const len = Math.hypot(nx, ny, nz) || 1;
    const cId = cart();
    const dId = dir();
    const fId = face();
    faceIds.push(fId);
    lines.push(`${ref(cId)}=CARTESIAN_POINT('',(${ax},${ay},${az}));`);
    lines.push(`${ref(dId)}=DIRECTION('',(${nx / len},${ny / len},${nz / len}));`);
    lines.push(`${ref(fId)}=ADVANCED_FACE('',(),(),.T.);`);
    void bx; void by; void bz; void cx; void cy; void cz;
  }
  const shId = shell();
  const manId = manifold();
  const prodId = product();
  lines.push(`${ref(shId)}=CLOSED_SHELL('',(${faceIds.map(ref).join(",")}));`);
  lines.push(`${ref(manId)}=MANIFOLD_SOLID_BREP('',${ref(shId)});`);
  lines.push(`${ref(prodId)}=PRODUCT('Receptacle','','',());`);
  lines.push("ENDSEC;");
  lines.push("END-ISO-10303-21;");
  downloadBlob(new Blob([lines.join("\n")], { type: "application/step" }), filename.endsWith(".step") ? filename : `${filename}.step`);
}

/** Press-fit tolerance strip — slots from 0.05 to 0.35 mm clearance. */
export function exportToleranceStrip(material: ReceptacleParams["material"], fit: FitClass): void {
  const base = fitClearance(material, fit);
  const slots = [base - 0.1, base - 0.05, base, base + 0.05, base + 0.1].map((v) =>
    Math.max(0.05, Number(v.toFixed(2))),
  );
  const stripL = 80;
  const stripW = 12;
  const stripH = 2;
  const positions: number[] = [];
  const indices: number[] = [];
  let vi = 0;
  const addBox = (x0: number, y0: number, z0: number, dx: number, dy: number, dz: number) => {
    const base = vi;
    positions.push(
      x0, y0, z0, x0 + dx, y0, z0, x0 + dx, y0 + dy, z0, x0, y0 + dy, z0,
      x0, y0, z0 + dz, x0 + dx, y0, z0 + dz, x0 + dx, y0 + dy, z0 + dz, x0, y0 + dy, z0 + dz,
    );
    const faces = [
      [0, 1, 2], [0, 2, 3], [4, 6, 5], [4, 7, 6],
      [0, 4, 5], [0, 5, 1], [2, 6, 7], [2, 7, 3],
      [0, 3, 7], [0, 7, 4], [1, 5, 6], [1, 6, 2],
    ];
    for (const [a, b, c] of faces) indices.push(base + a, base + b, base + c);
    vi += 8;
  };
  addBox(0, 0, 0, stripL, stripW, stripH);
  const slotW = 3;
  slots.forEach((gap, i) => {
    const x = 8 + i * 14;
    addBox(x, stripW / 2 - gap / 2, 0, slotW, gap, stripH + 0.1);
  });
  const part: GeneratedPart = {
    positions: new Float32Array(positions),
    indices: new Uint32Array(indices),
    triangleCount: indices.length / 3,
  };
  exportPartToStl(part, `tolerance_strip_${MATERIALS[material].name}_${fit}.stl`);
}

/** Split an oversized body into bed tiles for separate prints (#37). */
export function exportTiledStl(
  part: GeneratedPart,
  bedW: number,
  bedD: number,
  baseName: string,
): number {
  const pos = part.positions;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < pos.length; i += 3) {
    minX = Math.min(minX, pos[i]);
    maxX = Math.max(maxX, pos[i]);
    minY = Math.min(minY, pos[i + 1]);
    maxY = Math.max(maxY, pos[i + 1]);
  }
  const fw = maxX - minX;
  const fd = maxY - minY;
  const nx = Math.max(1, Math.ceil(fw / bedW));
  const ny = Math.max(1, Math.ceil(fd / bedD));
  if (nx === 1 && ny === 1) {
    exportPartToStl(part, `${baseName}.stl`);
    return 1;
  }
  const tileW = fw / nx;
  const tileD = fd / ny;
  let count = 0;
  for (let ix = 0; ix < nx; ix++) {
    for (let iy = 0; iy < ny; iy++) {
      const x0 = minX + ix * tileW;
      const y0 = minY + iy * tileD;
      const x1 = x0 + tileW;
      const y1 = y0 + tileD;
      const newPos: number[] = [];
      const newIdx: number[] = [];
      const map = new Map<number, number>();
      const triCount = part.indices.length / 3;
      for (let t = 0; t < triCount; t++) {
        const ia = part.indices[t * 3];
        const ib = part.indices[t * 3 + 1];
        const ic = part.indices[t * 3 + 2];
        const cx = (pos[ia * 3] + pos[ib * 3] + pos[ic * 3]) / 3;
        const cy = (pos[ia * 3 + 1] + pos[ib * 3 + 1] + pos[ic * 3 + 1]) / 3;
        if (cx < x0 || cx > x1 || cy < y0 || cy > y1) continue;
        for (const vi of [ia, ib, ic]) {
          if (!map.has(vi)) {
            const ni = map.size;
            map.set(vi, ni);
            newPos.push(pos[vi * 3], pos[vi * 3 + 1], pos[vi * 3 + 2]);
          }
        }
        newIdx.push(map.get(ia)!, map.get(ib)!, map.get(ic)!);
      }
      if (newIdx.length < 3) continue;
      const tile: GeneratedPart = {
        positions: new Float32Array(newPos),
        indices: new Uint32Array(newIdx),
        triangleCount: newIdx.length / 3,
      };
      exportPartToStl(tile, `${baseName}_tile_${ix + 1}x${iy + 1}.stl`);
      count++;
    }
  }
  return count;
}
