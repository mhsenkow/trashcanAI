// Background SDF → mesh export for STL and stats (preview is GPU raymarch).

import { exportSdfGeometry } from "./march";
import type { GeneratedGeometry, ReceptacleParams } from "../types";

export interface SdfWorkerRequest {
  id: number;
  params: ReceptacleParams;
}

export type SdfWorkerResponse =
  | { id: number; ok: true; geometry: GeneratedGeometry; params: ReceptacleParams }
  | { id: number; ok: false; error: string };

const ctx: {
  onmessage: ((ev: MessageEvent<SdfWorkerRequest>) => void) | null;
  postMessage: (msg: SdfWorkerResponse, transfer?: Transferable[]) => void;
} = self as never;

function transferList(geometry: GeneratedGeometry): Transferable[] {
  const buffers = new Set<Transferable>();
  buffers.add(geometry.body.positions.buffer);
  buffers.add(geometry.body.indices.buffer);
  if (geometry.lid) {
    buffers.add(geometry.lid.positions.buffer);
    buffers.add(geometry.lid.indices.buffer);
  }
  return [...buffers];
}

let pending: SdfWorkerRequest | null = null;
let chain: Promise<void> = Promise.resolve();

async function drainQueue(): Promise<void> {
  while (pending) {
    const req = pending;
    pending = null;
    try {
      const geometry = exportSdfGeometry(req.params, req.params.smoothing);
      ctx.postMessage(
        { id: req.id, ok: true, geometry, params: req.params },
        transferList(geometry),
      );
    } catch (e) {
      ctx.postMessage({
        id: req.id,
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
}

ctx.onmessage = (ev: MessageEvent<SdfWorkerRequest>) => {
  pending = ev.data;
  chain = chain.then(drainQueue);
};
