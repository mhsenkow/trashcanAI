"use client";

import dynamic from "next/dynamic";
import { useGeometry } from "@/lib/useGeometry";
import { MengerLoader } from "./MengerLoader";
import { Sidebar } from "./Sidebar";
import { ViewCube } from "./ViewControls";

const Viewport = dynamic(() => import("./Viewport"), {
  ssr: false,
});

export default function Studio() {
  const geo = useGeometry();

  return (
    <div className="h-full w-full flex bg-[#0a0b0d]">
      <div className="relative flex-1 min-w-0">
        <Viewport geometry={geo.geometry} generation={geo.generation} />

        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-4">
          <div className="flex items-center gap-2 rounded-md bg-black/40 backdrop-blur px-2.5 py-1.5 border border-white/5 w-fit">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                geo.status === "error"
                  ? "bg-red-400"
                  : geo.paramsPending
                    ? "bg-amber-400 animate-pulse"
                    : "bg-[var(--accent)]"
              }`}
            />
            <span className="text-[11px] font-mono text-zinc-300">
              {geo.status === "error"
                ? "ENGINE ERROR"
                : geo.paramsPending
                  ? "UPDATING"
                  : geo.exporting
                    ? "EXPORTING"
                    : "READY"}
            </span>
          </div>
          <span className="text-[11px] font-mono text-zinc-600 pt-1 shrink-0">
            drag · orbit&nbsp;&nbsp;scroll · zoom
          </span>
        </div>

        <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2">
          <ViewCube />
        </div>

        {geo.status === "loading" && !geo.geometry && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <MengerLoader label={geo.loaderLabel} />
          </div>
        )}

        {geo.paramsPending && geo.geometry && (
          <div className="pointer-events-none absolute inset-0 flex items-end justify-center pb-8">
            <div className="rounded-md bg-black/50 backdrop-blur px-3 py-1.5 border border-white/10 text-[11px] font-mono text-zinc-300">
              Updating preview…
            </div>
          </div>
        )}

        {geo.status === "error" && (
          <div className="absolute inset-x-0 bottom-0 m-4 rounded-lg bg-red-950/70 border border-red-800/60 px-4 py-3 backdrop-blur">
            <p className="text-xs font-semibold text-red-300">Geometry engine error</p>
            <p className="mt-0.5 text-[11px] font-mono text-red-200/80 break-words">
              {geo.error}
            </p>
          </div>
        )}
      </div>

      <div className="w-[360px] max-w-[34vw] shrink-0 h-full">
        <Sidebar {...geo} />
      </div>
    </div>
  );
}
