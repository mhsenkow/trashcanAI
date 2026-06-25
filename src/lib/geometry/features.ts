// Optional container features — cutters and add-ons applied after the hollow shell (#15–17, #28–37).

import type { CrossSection as CSCtor, Manifold } from "manifold-3d";
import { clampRadius, roundedRectPoints } from "./profile";
import type { ReceptacleParams } from "../types";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export interface FeatureCtx {
  halfL: number;
  halfW: number;
  innerHalfL: number;
  innerHalfW: number;
  innerR: number;
  H: number;
  floorT: number;
  topZ: number;
  r: number;
  t: number;
  taperTop: number;
}

function unionAll(parts: Manifold[]): Manifold | null {
  if (!parts.length) return null;
  let cur = parts[0];
  for (let i = 1; i < parts.length; i++) {
    const u = cur.add(parts[i]);
    cur.delete();
    parts[i].delete();
    cur = u;
  }
  return cur;
}

/** Cutters removed from the finished hollow body. */
export function buildBodyCutters(
  CrossSection: typeof CSCtor,
  params: ReceptacleParams,
  ctx: FeatureCtx,
): Manifold[] {
  const cutters: Manifold[] = [];
  const { halfL, halfW, H, t } = ctx;

  if (params.fingerScoop && params.fingerScoopDepth >= 2) {
    const d = clamp(params.fingerScoopDepth, 2, halfW * 0.45);
    const span = Math.min(halfL * 0.55, 50);
    cutters.push(
      CrossSection.circle(d, 28)
        .extrude(span * 2)
        .rotate([90, 0, 0])
        .translate(0, -halfW - d * 0.5, H * 0.38),
    );
  }

  if (params.handleStyle === "cutout") {
    const hw = 28;
    const hh = 14;
    const depth = t + 3;
    const rect = new CrossSection([
      [-hw / 2, -hh / 2],
      [hw / 2, -hh / 2],
      [hw / 2, hh / 2],
      [-hw / 2, hh / 2],
    ]);
    for (const sx of [-1, 1] as const) {
      cutters.push(
        rect.extrude(depth).translate(sx * (halfL + depth * 0.5), 0, H * 0.52),
      );
    }
    rect.delete();
  }

  if (params.labelSlot && params.labelWidth >= 8) {
    const lw = clamp(params.labelWidth, 8, halfL * 1.2);
    const lh = clamp(params.labelHeight, 4, H * 0.35);
    const depth = 1.8;
    cutters.push(
      new CrossSection([
        [-lw / 2, -lh / 2],
        [lw / 2, -lh / 2],
        [lw / 2, lh / 2],
        [-lw / 2, lh / 2],
      ])
        .extrude(depth)
        .translate(0, -halfL - depth * 0.5, H * 0.62),
    );
  }

  if (params.ventSlots && params.ventSlotWidth >= 2) {
    const vw = clamp(params.ventSlotWidth, 2, 20);
    const vh = Math.max(t * 1.8, 2.5);
    const depth = t + 2;
    const count = 5;
    for (let i = 0; i < count; i++) {
      const ox = (i - (count - 1) / 2) * (vw + 5);
      cutters.push(
        new CrossSection([
          [-vw / 2, -vh / 2],
          [vw / 2, -vh / 2],
          [vw / 2, vh / 2],
          [-vw / 2, vh / 2],
        ])
          .extrude(depth)
          .translate(ox, halfW + depth * 0.5, H * 0.55),
      );
    }
  }

  if (params.wallMount === "keyhole") {
    const slotW = 6;
    const slotH = 14;
    const depth = t + 2;
    cutters.push(
      new CrossSection([
        [-slotW / 2, -slotH / 2],
        [slotW / 2, -slotH / 2],
        [slotW / 2, slotH / 2],
        [-slotW / 2, slotH / 2],
      ])
        .extrude(depth)
        .translate(0, halfW + depth * 0.5, H * 0.72),
    );
    cutters.push(
      CrossSection.circle(3.5, 20)
        .extrude(depth)
        .translate(0, halfW + depth * 0.5, H * 0.72 + 5),
    );
  }

  if (params.gridfinityBase) {
    const pitch = 42;
    const lip = 5.1;
    const nx = Math.max(1, Math.floor((halfL * 2) / pitch));
    const ny = Math.max(1, Math.floor((halfW * 2) / pitch));
    const gx0 = -((nx - 1) * pitch) / 2;
    const gy0 = -((ny - 1) * pitch) / 2;
    for (let ix = 0; ix < nx; ix++) {
      for (let iy = 0; iy < ny; iy++) {
        const cx = gx0 + ix * pitch;
        const cy = gy0 + iy * pitch;
        cutters.push(
          CrossSection.circle(lip * 0.92, 24)
            .extrude(2.2)
            .translate(cx, cy, -0.5),
        );
      }
    }
  }

  if (params.gasketGroove && params.gasketDepth >= 0.3) {
    const gw = clamp(params.gasketWidth, 1, 4);
    const gd = clamp(params.gasketDepth, 0.3, 2.5);
    const rimL = halfL - t * 0.4;
    const rimW = halfW - t * 0.4;
    const rimR = clampRadius(rimL, rimW, Math.max(0, ctx.r - t * 0.5));
    const outer = new CrossSection(
      roundedRectPoints(rimL, rimW, rimR, Math.max(rimL, rimW) / 32, 12),
    );
    const innerL = rimL - gw;
    const innerW = rimW - gw;
    const innerR = clampRadius(innerL, innerW, Math.max(0, rimR - gw));
    const inner = new CrossSection(
      roundedRectPoints(innerL, innerW, innerR, Math.max(innerL, innerW) / 32, 12),
    );
    cutters.push(
      outer.subtract(inner).extrude(gd + 0.5).translate(0, 0, H - gd),
    );
    outer.delete();
    inner.delete();
  }

  if (params.insertBosses && params.insertDiameter >= 2) {
    const d = clamp(params.insertDiameter, 2, 8);
    const bossR = d / 2 + 2.5;
    const bossH = Math.min(8, H * 0.12);
    const inset = Math.min(halfL, halfW) * 0.22;
    const corners: [number, number][] = [
      [-inset, -inset],
      [inset, -inset],
      [-inset, inset],
      [inset, inset],
    ];
    for (const [cx, cy] of corners) {
      cutters.push(
        CrossSection.circle(d / 2, 20)
          .extrude(bossH + 2)
          .translate(cx, cy, -1),
      );
      // boss shell added separately
    }
    void bossR;
  }

  return cutters;
}

/** Solids unioned onto the hollow body (dividers, stack lip, grip ridges, bosses). */
export function buildBodyAdditions(
  CrossSection: typeof CSCtor,
  params: ReceptacleParams,
  ctx: FeatureCtx,
): Manifold[] {
  const adds: Manifold[] = [];
  const { innerHalfL, innerHalfW, innerR, H, floorT, t, topZ } = ctx;

  const cols = Math.max(0, Math.floor(params.dividerCols));
  const rows = Math.max(0, Math.floor(params.dividerRows));
  if (cols > 0 || rows > 0) {
    const wallH = H - floorT - 1;
    const thick = Math.max(t * 0.85, 1);
    if (cols > 0) {
      for (let i = 1; i <= cols; i++) {
        const x = -innerHalfL + (i * 2 * innerHalfL) / (cols + 1);
        adds.push(
          new CrossSection([
            [x - thick / 2, -innerHalfW + 1],
            [x + thick / 2, -innerHalfW + 1],
            [x + thick / 2, innerHalfW - 1],
            [x - thick / 2, innerHalfW - 1],
          ]).extrude(wallH),
        );
      }
    }
    if (rows > 0) {
      for (let j = 1; j <= rows; j++) {
        const y = -innerHalfW + (j * 2 * innerHalfW) / (rows + 1);
        adds.push(
          new CrossSection([
            [-innerHalfL + 1, y - thick / 2],
            [innerHalfL - 1, y - thick / 2],
            [innerHalfL - 1, y + thick / 2],
            [-innerHalfL + 1, y + thick / 2],
          ]).extrude(wallH),
        );
      }
    }
    void innerR;
  }

  if (params.stackLip && params.stackLipHeight >= 1) {
    const lipH = clamp(params.stackLipHeight, 1, 6);
    const lipT = Math.max(t * 0.6, 0.8);
    const oL = innerHalfL - lipT;
    const oW = innerHalfW - lipT;
    const oR = clampRadius(oL, oW, Math.max(0, innerR - lipT));
    const iL = oL - lipT;
    const iW = oW - lipT;
    const iR = clampRadius(iL, iW, Math.max(0, oR - lipT));
    const outer = new CrossSection(
      roundedRectPoints(oL, oW, oR, Math.max(oL, oW) / 28, 10),
    );
    const inner = new CrossSection(
      roundedRectPoints(iL, iW, iR, Math.max(iL, iW) / 28, 10),
    );
    adds.push(outer.subtract(inner).extrude(lipH).translate(0, 0, H - lipH));
    outer.delete();
    inner.delete();
  }

  if (params.nestTaper > 0.1) {
    const taper = clamp(params.nestTaper, 0, 4);
    const scaleTop = 1 - taper / Math.max(innerHalfL, innerHalfW);
    const nestH = Math.min(12, H * 0.08);
    const cs = new CrossSection(
      roundedRectPoints(innerHalfL, innerHalfW, innerR, Math.max(innerHalfL, innerHalfW) / 28, 12),
    );
    adds.push(cs.extrude(nestH, 2, 0, scaleTop).translate(0, 0, H - nestH));
    cs.delete();
  }

  if (params.handleStyle === "grip") {
    const ridgeW = 6;
    const ridgeH = 2;
    for (const sx of [-1, 1] as const) {
      adds.push(
        new CrossSection([
          [-ridgeW / 2, 0],
          [ridgeW / 2, 0],
          [ridgeW / 2, ridgeH],
          [-ridgeW / 2, ridgeH],
        ])
          .extrude(ctx.halfW * 0.5)
          .rotate([0, 0, 90])
          .translate(sx * (ctx.halfL + ridgeH * 0.5), 0, H * 0.5),
      );
    }
  }

  if (params.insertBosses && params.insertDiameter >= 2) {
    const d = clamp(params.insertDiameter, 2, 8);
    const bossR = d / 2 + 2.5;
    const bossH = Math.min(8, H * 0.12);
    const inset = Math.min(ctx.halfL, ctx.halfW) * 0.22;
    const corners: [number, number][] = [
      [-inset, -inset],
      [inset, -inset],
      [-inset, inset],
      [inset, inset],
    ];
    for (const [cx, cy] of corners) {
      adds.push(
        CrossSection.circle(bossR, 24)
          .extrude(bossH)
          .translate(cx, cy, 0),
      );
    }
  }

  void topZ;
  return adds;
}

export function applyBodyFeatures(
  body: Manifold,
  CrossSection: typeof CSCtor,
  params: ReceptacleParams,
  ctx: FeatureCtx,
): Manifold {
  const cutters = buildBodyCutters(CrossSection, params, ctx);
  const adds = buildBodyAdditions(CrossSection, params, ctx);

  let work = body;
  if (cutters.length) {
    const cut = unionAll(cutters);
    if (cut) {
      const next = work.subtract(cut);
      cut.delete();
      if (next.status() === "NoError" && !next.isEmpty()) {
        work.delete();
        work = next;
      } else {
        next.delete();
      }
    }
  }
  if (adds.length) {
    const add = unionAll(adds);
    if (add) {
      const next = work.add(add);
      add.delete();
      if (next.status() === "NoError" && !next.isEmpty()) {
        work.delete();
        work = next;
      } else {
        next.delete();
      }
    }
  }
  return work;
}

/** Gasket groove cut into the lid underside. */
export function cutLidGasket(
  lid: Manifold,
  CrossSection: typeof CSCtor,
  params: ReceptacleParams,
  halfL: number,
  halfW: number,
  r: number,
  plateT: number,
): Manifold {
  if (!params.gasketGroove || params.gasketDepth < 0.3) return lid;
  const gw = clamp(params.gasketWidth, 1, 4);
  const gd = clamp(params.gasketDepth, 0.3, Math.min(2.5, plateT * 0.7));
  const rimL = halfL - 3;
  const rimW = halfW - 3;
  const rimR = clampRadius(rimL, rimW, Math.max(0, r - 3));
  const outer = new CrossSection(
    roundedRectPoints(rimL, rimW, rimR, Math.max(rimL, rimW) / 32, 12),
  );
  const innerL = rimL - gw;
  const innerW = rimW - gw;
  const innerR = clampRadius(innerL, innerW, Math.max(0, rimR - gw));
  const inner = new CrossSection(
    roundedRectPoints(innerL, innerW, innerR, Math.max(innerL, innerW) / 32, 12),
  );
  const groove = outer.subtract(inner).extrude(gd + 0.3).translate(0, 0, -gd);
  outer.delete();
  inner.delete();
  const cut = lid.subtract(groove);
  groove.delete();
  if (cut.status() === "NoError" && !cut.isEmpty()) {
    lid.delete();
    return cut;
  }
  cut.delete();
  return lid;
}
