// Dedicated module worker: owns the manifold WASM instance and runs geometry
// generation off the main thread. Implements "latest-wins" coalescing so rapid
// slider drags never queue up stale work.

import { generate } from "./engine";
import { getManifold } from "./manifoldModule";
import type { GeneratedGeometry, ReceptacleParams } from "../types";

export interface WorkerRequest {
  id: number;
  params: ReceptacleParams;
}

export type WorkerResponse =
  | { id: number; ok: true; geometry: GeneratedGeometry }
  | { id: number; ok: false; error: string };

// `any` avoids dom-vs-webworker lib `self` type conflicts; messages stay typed.
const ctx: {
  onmessage: ((ev: MessageEvent<WorkerRequest>) => void) | null;
  postMessage: (msg: WorkerResponse, transfer?: Transferable[]) => void;
} = self as never;

let busy = false;
let pending: WorkerRequest | null = null;

async function run(req: WorkerRequest): Promise<void> {
  busy = true;
  try {
    const wasm = await getManifold();
    const geometry = generate(wasm, req.params);
    const transfer: Transferable[] = [
      geometry.body.positions.buffer,
      geometry.body.indices.buffer,
    ];
    if (geometry.lid) {
      transfer.push(geometry.lid.positions.buffer, geometry.lid.indices.buffer);
    }
    ctx.postMessage({ id: req.id, ok: true, geometry }, transfer);
  } catch (e) {
    ctx.postMessage({
      id: req.id,
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    });
  } finally {
    busy = false;
    if (pending) {
      const next = pending;
      pending = null;
      void run(next);
    }
  }
}

ctx.onmessage = (ev: MessageEvent<WorkerRequest>) => {
  if (busy) {
    pending = ev.data; // keep only the most recent request
    return;
  }
  void run(ev.data);
};
