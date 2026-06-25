// Dedicated module worker: owns the manifold WASM instance and runs geometry
// generation off the main thread. Requests are strictly serialized through a
// promise chain so generate() is never called concurrently (WASM is not reentrant).

import { generate } from "./engine";
import { getManifold, prefetchManifold } from "./manifoldModule";
import type { GeneratedGeometry, GeneratedPart, GenerateQuality, ReceptacleParams } from "../types";

export interface WorkerRequest {
  id: number;
  params: ReceptacleParams;
  quality?: GenerateQuality;
}

export type WorkerResponse =
  | { id: number; ok: true; geometry: GeneratedGeometry; params: ReceptacleParams; quality: GenerateQuality }
  | { id: number; ok: false; error: string };

const ctx: {
  onmessage: ((ev: MessageEvent<WorkerRequest>) => void) | null;
  postMessage: (msg: WorkerResponse, transfer?: Transferable[]) => void;
} = self as never;

// Start WASM download as soon as the worker boots — overlaps with first request.
prefetchManifold();

function clonePart(part: GeneratedPart): GeneratedPart {
  return {
    positions: new Float32Array(part.positions),
    indices: new Uint32Array(part.indices),
    triangleCount: part.triangleCount,
  };
}

function cloneGeometry(geometry: GeneratedGeometry): GeneratedGeometry {
  return {
    body: clonePart(geometry.body),
    lid: geometry.lid ? clonePart(geometry.lid) : null,
    stats: { ...geometry.stats },
  };
}

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

/** Latest preview waiting while work is in flight (latest-wins). */
let pendingPreview: WorkerRequest | null = null;
/** Latest full export waiting — always drained before preview. */
let pendingFull: WorkerRequest | null = null;
/** Serializes all WASM work — never overlap generate() calls. */
let chain: Promise<void> = Promise.resolve();

async function drainQueue(): Promise<void> {
  while (pendingFull || pendingPreview) {
    const req = pendingFull ?? pendingPreview!;
    if (pendingFull === req) pendingFull = null;
    else pendingPreview = null;
    try {
      const wasm = await getManifold();
      const quality = req.quality ?? "full";
      const geometry = generate(wasm, req.params, { quality });
      const outgoing = cloneGeometry(geometry);
      ctx.postMessage(
        { id: req.id, ok: true, geometry: outgoing, params: req.params, quality },
        transferList(outgoing),
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

ctx.onmessage = (ev: MessageEvent<WorkerRequest>) => {
  const req = ev.data;
  if ((req.quality ?? "full") === "full") {
    pendingFull = req;
  } else {
    pendingPreview = req;
  }
  chain = chain.then(drainQueue);
};
