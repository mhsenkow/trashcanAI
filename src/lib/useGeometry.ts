"use client";

// Bridges the parameter store to the geometry worker and exposes the latest
// generated result to React. Debounces rapid changes, coalesces to the most
// recent request, and transparently falls back to main-thread generation if the
// worker can't be created (e.g. unusual bundler/runtime environments).

import { useEffect, useRef, useState } from "react";
import { paramsEqual, selectParams, useParamStore } from "./store";
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
  /** Params used for the mesh currently shown (null before first successful gen). */
  builtParams: ReceptacleParams | null;
  /** Monotonic id — bump on each successful generation so the viewport remounts. */
  generation: number;
  /** True when sliders differ from the mesh on screen (debounce / worker in flight). */
  paramsPending: boolean;
}

const DEBOUNCE_MS = 120;

export function useGeometry(): GeometryState {
  const [state, setState] = useState<Omit<GeometryState, "paramsPending">>({
    geometry: null,
    status: "loading",
    error: null,
    builtParams: null,
    generation: 0,
  });

  const workerRef = useRef<Worker | null>(null);
  const reqId = useRef(0);
  const latestId = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Main-thread fallback machinery (only used if the worker fails).
  const fallback = useRef(false);
  const fbBusy = useRef(false);
  const fbPending = useRef<ReceptacleParams | null>(null);

  const [workerBusy, setWorkerBusy] = useState(false);

  useEffect(() => {
    let disposed = false;

    function applySuccess(geometry: GeneratedGeometry, params: ReceptacleParams) {
      if (disposed) return;
      setState((s) => ({
        geometry,
        status: "ready",
        error: null,
        builtParams: params,
        generation: s.generation + 1,
      }));
    }

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
        applySuccess(geometry, params);
      } catch (e) {
        if (!disposed)
          setState((s) => ({
            ...s,
            status: "error",
            error: e instanceof Error ? e.message : String(e),
          }));
      } finally {
        fbBusy.current = false;
        setWorkerBusy(false);
        if (fbPending.current) {
          const next = fbPending.current;
          fbPending.current = null;
          void runFallback(next);
        }
      }
    }

    function dispatch(params: ReceptacleParams) {
      if (fallback.current) {
        setWorkerBusy(true);
        void runFallback(params);
        return;
      }
      const worker = workerRef.current;
      if (!worker) return;
      setWorkerBusy(true);
      reqId.current += 1;
      latestId.current = reqId.current;
      const msg: WorkerRequest = { id: reqId.current, params };
      worker.postMessage(msg);
    }

    function schedule(params: ReceptacleParams) {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        setState((s) => ({ ...s, error: null }));
        dispatch(params);
      }, DEBOUNCE_MS);
    }

    function spawnWorker(): Worker | null {
      try {
        const worker = new Worker(
          new URL("./geometry/geometry.worker.ts", import.meta.url),
          { type: "module" },
        );
        worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
          const data = ev.data;
          if (data.id !== latestId.current) return;
          if (data.ok) {
            setWorkerBusy(false);
            applySuccess(data.geometry, data.params);
          } else {
            setWorkerBusy(false);
            console.warn("[useGeometry] generation failed:", data.error);
            setState((s) => ({
              ...s,
              status: s.geometry ? "ready" : "error",
              error: data.error,
            }));
            worker.terminate();
            workerRef.current = spawnWorker();
          }
        };
        worker.onerror = (e) => switchToFallback(e.message || "worker error");
        worker.onmessageerror = () => switchToFallback("message deserialization error");
        return worker;
      } catch (e) {
        switchToFallback(e instanceof Error ? e.message : String(e));
        return null;
      }
    }

    function switchToFallback(reason: string) {
      if (fallback.current) return;
      fallback.current = true;
      console.warn("[useGeometry] worker unavailable, falling back to main thread:", reason);
      workerRef.current?.terminate();
      workerRef.current = null;
      void runFallback(selectParams(useParamStore.getState()));
    }

    workerRef.current = spawnWorker();

    schedule(selectParams(useParamStore.getState()));
    let lastScheduled = selectParams(useParamStore.getState());
    const unsub = useParamStore.subscribe((s) => {
      const next = selectParams(s);
      if (paramsEqual(lastScheduled, next)) return;
      lastScheduled = next;
      schedule(next);
    });

    return () => {
      disposed = true;
      unsub();
      if (timer.current) clearTimeout(timer.current);
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  const paramsPending = workerBusy || state.status === "loading";

  return { ...state, paramsPending };
}