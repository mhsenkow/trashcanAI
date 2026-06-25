"use client";

// Preview meshes run on the main thread (~0.4–2s) — reliable WASM init, short enough
// not to freeze the UI. Full-quality export meshes run in a worker (~20–30s).

import { useCallback, useEffect, useRef, useState } from "react";
import { paramsEqual, selectParams, useParamStore } from "./store";
import type { GeneratedGeometry, ReceptacleParams } from "./types";
import type {
  WorkerRequest,
  WorkerResponse,
} from "./geometry/geometry.worker";

export type GenStatus = "loading" | "ready" | "error";

export type LoaderStage = "kernel" | "preview" | null;

export interface GeometryState {
  geometry: GeneratedGeometry | null;
  status: GenStatus;
  error: string | null;
  builtParams: ReceptacleParams | null;
  generation: number;
  paramsPending: boolean;
  meshQuality: "none" | "preview" | "full";
  loaderLabel: string;
  exporting: boolean;
  exportFullQuality: () => Promise<GeneratedGeometry | null>;
}

const PREVIEW_DEBOUNCE_MS = 80;
const PREVIEW_WATCHDOG_MS = 8_000;

const LOADER_LABELS: Record<Exclude<LoaderStage, null>, string> = {
  kernel: "Loading geometry kernel…",
  preview: "Building preview mesh…",
};

export function useGeometry(): GeometryState {
  const [state, setState] = useState<
    Omit<GeometryState, "paramsPending" | "exporting" | "exportFullQuality">
  >({
    geometry: null,
    status: "loading",
    error: null,
    builtParams: null,
    generation: 0,
    meshQuality: "none",
    loaderLabel: LOADER_LABELS.kernel,
  });

  const workerRef = useRef<Worker | null>(null);
  const reqId = useRef(0);
  const latestPreviewId = useRef(0);
  const latestFullId = useRef(0);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewWatchdog = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasMesh = useRef(false);
  const exportResolver = useRef<((g: GeneratedGeometry | null) => void) | null>(null);
  const fullCache = useRef<{ params: ReceptacleParams; geometry: GeneratedGeometry } | null>(null);
  const dispatchFullRef = useRef<(params: ReceptacleParams) => void>(() => {});

  const [previewBusy, setPreviewBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const exportBusyRef = useRef(false);
  exportBusyRef.current = exportBusy;

  /** Serializes main-thread preview passes — WASM generate() is not reentrant. */
  const previewChain = useRef(Promise.resolve());

  useEffect(() => {
    let disposed = false;

    function setLoaderStage(stage: LoaderStage) {
      if (disposed || hasMesh.current) return;
      setState((s) => ({
        ...s,
        loaderLabel: stage ? LOADER_LABELS[stage] : s.loaderLabel,
      }));
    }

    function clearPreviewWatchdog() {
      if (previewWatchdog.current) {
        clearTimeout(previewWatchdog.current);
        previewWatchdog.current = null;
      }
    }

    function armPreviewWatchdog(id: number, params: ReceptacleParams) {
      clearPreviewWatchdog();
      previewWatchdog.current = setTimeout(() => {
        if (disposed || id !== latestPreviewId.current || hasMesh.current) return;
        console.warn("[useGeometry] preview watchdog — retrying");
        void runPreview(params, id);
      }, PREVIEW_WATCHDOG_MS);
    }

    function applyPreview(geometry: GeneratedGeometry, params: ReceptacleParams) {
      if (disposed) return;
      hasMesh.current = true;
      clearPreviewWatchdog();
      fullCache.current = null;
      setState((s) => ({
        geometry,
        status: "ready",
        error: null,
        builtParams: params,
        generation: s.generation + 1,
        meshQuality: "preview",
        loaderLabel: LOADER_LABELS.preview,
      }));
    }

    function finishExport(
      geometry: GeneratedGeometry | null,
      params: ReceptacleParams,
      id: number,
    ) {
      if (id !== latestFullId.current) return;
      setExportBusy(false);
      if (geometry) fullCache.current = { params, geometry };
      exportResolver.current?.(geometry);
      exportResolver.current = null;
    }

    async function runPreview(params: ReceptacleParams, id: number) {
      if (!hasMesh.current) setLoaderStage("preview");
      try {
        const [{ generate }, { getManifold }] = await Promise.all([
          import("./geometry/engine"),
          import("./geometry/manifoldModule"),
        ]);
        if (disposed || id !== latestPreviewId.current) return;

        const wasm = await getManifold();
        if (disposed || id !== latestPreviewId.current) return;

        const geometry = generate(wasm, params, { quality: "preview" });
        if (disposed || id !== latestPreviewId.current) return;

        applyPreview(geometry, params);
      } catch (e) {
        if (!disposed && id === latestPreviewId.current) {
          setState((s) => ({
            ...s,
            status: hasMesh.current ? "ready" : "error",
            error: e instanceof Error ? e.message : String(e),
          }));
        }
      } finally {
        if (id === latestPreviewId.current) {
          clearPreviewWatchdog();
          setPreviewBusy(false);
        }
      }
    }

    function dispatchPreview(params: ReceptacleParams) {
      reqId.current += 1;
      const id = reqId.current;
      latestPreviewId.current = id;
      setPreviewBusy(true);
      setState((s) => ({ ...s, error: null }));
      armPreviewWatchdog(id, params);

      previewChain.current = previewChain.current
        .catch(() => {})
        .then(() => {
          if (disposed || id !== latestPreviewId.current) return;
          return runPreview(params, id);
        });
    }

    async function runFullFallback(params: ReceptacleParams, id: number) {
      try {
        const [{ generate }, { getManifold }] = await Promise.all([
          import("./geometry/engine"),
          import("./geometry/manifoldModule"),
        ]);
        const wasm = await getManifold();
        const geometry = generate(wasm, params, { quality: "full" });
        if (disposed || id !== latestFullId.current) return;
        finishExport(geometry, params, id);
      } catch (e) {
        if (!disposed && id === latestFullId.current) {
          setState((s) => ({
            ...s,
            status: s.geometry ? "ready" : "error",
            error: e instanceof Error ? e.message : String(e),
          }));
        }
        finishExport(null, params, id);
      }
    }

    function dispatchFull(params: ReceptacleParams) {
      reqId.current += 1;
      const id = reqId.current;
      latestFullId.current = id;
      setExportBusy(true);

      if (!workerRef.current) {
        void runFullFallback(params, id);
        return;
      }

      workerRef.current.postMessage({ id, params, quality: "full" } satisfies WorkerRequest);
    }

    dispatchFullRef.current = dispatchFull;

    function schedulePreview(params: ReceptacleParams) {
      if (previewTimer.current) clearTimeout(previewTimer.current);
      previewTimer.current = setTimeout(() => {
        previewTimer.current = null;
        dispatchPreview(params);
      }, PREVIEW_DEBOUNCE_MS);
    }

    function spawnWorker(): Worker | null {
      try {
        const worker = new Worker(
          new URL("./geometry/geometry.worker.ts", import.meta.url),
          { type: "module" },
        );
        worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
          const data = ev.data;
          if (!data.ok) {
            console.warn("[useGeometry] export generation failed:", data.error);
            if (data.id === latestFullId.current) {
              void runFullFallback(selectParams(useParamStore.getState()), data.id);
            }
            return;
          }
          if (data.quality === "full" && data.id === latestFullId.current) {
            finishExport(data.geometry, data.params, data.id);
          }
        };
        worker.onerror = (ev) => {
          console.warn("[useGeometry] export worker error:", ev.message);
          worker.terminate();
          workerRef.current = null;
          if (exportBusyRef.current) {
            void runFullFallback(selectParams(useParamStore.getState()), latestFullId.current);
          }
        };
        return worker;
      } catch (e) {
        console.warn("[useGeometry] export worker unavailable:", e);
        return null;
      }
    }

    void import("./geometry/manifoldModule").then((m) => m.prefetchManifold());
    workerRef.current = spawnWorker();

    const initial = selectParams(useParamStore.getState());
    dispatchPreview(initial);

    let lastScheduled = initial;
    const unsub = useParamStore.subscribe((s) => {
      const next = selectParams(s);
      if (paramsEqual(lastScheduled, next)) return;
      lastScheduled = next;
      schedulePreview(next);
    });

    return () => {
      disposed = true;
      unsub();
      if (previewTimer.current) clearTimeout(previewTimer.current);
      clearPreviewWatchdog();
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  const exportFullQuality = useCallback((): Promise<GeneratedGeometry | null> => {
    const params = selectParams(useParamStore.getState());
    const cached = fullCache.current;
    if (cached && paramsEqual(cached.params, params)) {
      return Promise.resolve(cached.geometry);
    }

    return new Promise((resolve) => {
      exportResolver.current = resolve;
      dispatchFullRef.current(params);
    });
  }, []);

  const paramsPending = previewBusy || state.status === "loading";

  return {
    ...state,
    paramsPending,
    exporting: exportBusy,
    exportFullQuality,
  };
}
