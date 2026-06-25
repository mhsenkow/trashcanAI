"use client";

// Instant SDF preview + background mesh export for STL.

import { useEffect, useRef, useState } from "react";
import { paramsEqual, selectParams, useParamStore } from "./store";
import type { GeneratedGeometry, ReceptacleParams } from "./types";
import type { SdfWorkerRequest, SdfWorkerResponse } from "./sdf/sdf.worker";

export type GenStatus = "loading" | "ready" | "error";

export interface GeometryState {
  geometry: GeneratedGeometry | null;
  status: GenStatus;
  error: string | null;
  builtParams: ReceptacleParams | null;
  generation: number;
  /** True while export mesh is catching up (preview is always live). */
  paramsPending: boolean;
}

const MESH_DEBOUNCE_MS = 400;

export function useParametricEngine(): GeometryState {
  const [state, setState] = useState<Omit<GeometryState, "paramsPending">>({
    geometry: null,
    status: "ready",
    error: null,
    builtParams: null,
    generation: 0,
  });

  const workerRef = useRef<Worker | null>(null);
  const reqId = useRef(0);
  const latestId = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [meshBusy, setMeshBusy] = useState(false);

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

    function dispatch(params: ReceptacleParams) {
      const worker = workerRef.current;
      if (!worker) return;
      setMeshBusy(true);
      reqId.current += 1;
      latestId.current = reqId.current;
      const msg: SdfWorkerRequest = { id: reqId.current, params };
      worker.postMessage(msg);
    }

    function schedule(params: ReceptacleParams) {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => dispatch(params), MESH_DEBOUNCE_MS);
    }

    try {
      workerRef.current = new Worker(
        new URL("./sdf/sdf.worker.ts", import.meta.url),
        { type: "module" },
      );
      workerRef.current.onmessage = (ev: MessageEvent<SdfWorkerResponse>) => {
        const data = ev.data;
        if (data.id !== latestId.current) return;
        setMeshBusy(false);
        if (data.ok) applySuccess(data.geometry, data.params);
        else
          setState((s) => ({
            ...s,
            status: s.geometry ? "ready" : "error",
            error: data.error,
          }));
      };
    } catch (e) {
      console.warn("[useParametricEngine] worker failed, mesh export on main thread", e);
      workerRef.current = null;
    }

    schedule(selectParams(useParamStore.getState()));
    let last = selectParams(useParamStore.getState());
    const unsub = useParamStore.subscribe((s) => {
      const next = selectParams(s);
      if (paramsEqual(last, next)) return;
      last = next;
      schedule(next);
    });

    return () => {
      disposed = true;
      unsub();
      if (timer.current) clearTimeout(timer.current);
      workerRef.current?.terminate();
    };
  }, []);

  return { ...state, paramsPending: meshBusy };
}
