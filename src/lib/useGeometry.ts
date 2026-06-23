"use client";

// Bridges the parameter store to the geometry worker and exposes the latest
// generated result to React. Debounces rapid changes, coalesces to the most
// recent request, and transparently falls back to main-thread generation if the
// worker can't be created (e.g. unusual bundler/runtime environments).

import { useEffect, useRef, useState } from "react";
import { selectParams, useParamStore } from "./store";
import type { GeneratedGeometry, ReceptacleParams } from "./types";
import type {
  WorkerRequest,
  WorkerResponse,
} from "./geometry/geometry.worker";

export type GenStatus = "loading" | "ready" | "error";

export interface GeometryState {
  geometry: GeneratedGeometry | null;
  status: GenStatus;
  error: string | null;
}

const DEBOUNCE_MS = 90;

export function useGeometry(): GeometryState {
  const [state, setState] = useState<GeometryState>({
    geometry: null,
    status: "loading",
    error: null,
  });

  const workerRef = useRef<Worker | null>(null);
  const reqId = useRef(0);
  const latestId = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Main-thread fallback machinery (only used if the worker fails).
  const fallback = useRef(false);
  const fbBusy = useRef(false);
  const fbPending = useRef<ReceptacleParams | null>(null);

  useEffect(() => {
    let disposed = false;

    async function runFallback(params: ReceptacleParams) {
      if (fbBusy.current) {
        fbPending.current = params;
        return;
      }
      fbBusy.current = true;
      try {
        const [{ generate }, { getManifold }] = await Promise.all([
          import("./geometry/engine"),
          import("./geometry/manifoldModule"),
        ]);
        const wasm = await getManifold();
        const geometry = generate(wasm, params);
        if (!disposed) setState({ geometry, status: "ready", error: null });
      } catch (e) {
        if (!disposed)
          setState((s) => ({
            ...s,
            status: "error",
            error: e instanceof Error ? e.message : String(e),
          }));
      } finally {
        fbBusy.current = false;
        if (fbPending.current) {
          const next = fbPending.current;
          fbPending.current = null;
          void runFallback(next);
        }
      }
    }

    function dispatch(params: ReceptacleParams) {
      if (fallback.current) {
        void runFallback(params);
        return;
      }
      const worker = workerRef.current;
      if (!worker) return;
      reqId.current += 1;
      latestId.current = reqId.current;
      const msg: WorkerRequest = { id: reqId.current, params };
      worker.postMessage(msg);
    }

    function schedule(params: ReceptacleParams) {
      setState((s) => (s.status === "error" ? s : { ...s, status: "loading" }));
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => dispatch(params), DEBOUNCE_MS);
    }

    function switchToFallback(reason: string) {
      if (fallback.current) return;
      fallback.current = true;
      console.warn("[useGeometry] worker unavailable, falling back to main thread:", reason);
      workerRef.current?.terminate();
      workerRef.current = null;
      void runFallback(selectParams(useParamStore.getState()));
    }

    try {
      const worker = new Worker(
        new URL("./geometry/geometry.worker.ts", import.meta.url),
        { type: "module" },
      );
      worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
        const data = ev.data;
        if (data.id !== latestId.current) return; // drop superseded results
        if (data.ok) {
          setState({ geometry: data.geometry, status: "ready", error: null });
        } else {
          setState((s) => ({ ...s, status: "error", error: data.error }));
        }
      };
      worker.onerror = (e) => switchToFallback(e.message || "worker error");
      worker.onmessageerror = () => switchToFallback("message deserialization error");
      workerRef.current = worker;
    } catch (e) {
      switchToFallback(e instanceof Error ? e.message : String(e));
    }

    // Kick off the first generation and react to every subsequent change.
    schedule(selectParams(useParamStore.getState()));
    const unsub = useParamStore.subscribe((s) => schedule(selectParams(s)));

    return () => {
      disposed = true;
      unsub();
      if (timer.current) clearTimeout(timer.current);
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  return state;
}
