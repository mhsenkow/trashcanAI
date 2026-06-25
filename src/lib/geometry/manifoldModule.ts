// Loads the manifold3d WASM module once, lazily.
//
// We import the Emscripten glue (`/manifold.js`) at runtime from the public dir
// with `webpackIgnore` so the bundler never tries to process its dual
// node/browser shims or rewrite the `.wasm` fetch — the browser just fetches
// both files from the origin. `locateFile` pins the wasm to the public root.

import type { ManifoldToplevel } from "manifold-3d";
import { publicUrl } from "../basePath";

let instance: ManifoldToplevel | null = null;
let loading: Promise<ManifoldToplevel> | null = null;

async function assertManifoldAssets(): Promise<void> {
  const wasmUrl = publicUrl("/manifold.wasm");
  const res = await fetch(wasmUrl);
  if (!res.ok) {
    throw new Error(
      `manifold.wasm not found (${res.status}). Run \`pnpm dev\` or \`node scripts/copy-manifold.mjs\` to copy WASM into public/.`,
    );
  }
}

export function getManifold(): Promise<ManifoldToplevel> {
  if (instance) return Promise.resolve(instance);
  if (loading) return loading;

  loading = (async () => {
    await assertManifoldAssets();

    type ManifoldFactory = (opts?: {
      locateFile?: (path: string) => string;
    }) => Promise<ManifoldToplevel>;

    const manifoldJs = publicUrl("/manifold.js");
    const mod = (await import(
      /* webpackIgnore: true */ /* turbopackIgnore: true */ manifoldJs
    )) as { default: ManifoldFactory };

    const wasm = await mod.default({
      locateFile: (path: string) => publicUrl("/" + path.split("/").pop()),
    });
    wasm.setup();
    instance = wasm;
    return wasm;
  })().catch((e) => {
    loading = null;
    throw e;
  });

  return loading;
}

/** Kick off WASM download/compile early (safe to call multiple times). */
export function prefetchManifold(): void {
  void getManifold().catch(() => {});
}
