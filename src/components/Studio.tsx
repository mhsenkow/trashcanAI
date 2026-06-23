"use client";

import dynamic from "next/dynamic";
import { useGeometry } from "@/lib/useGeometry";
import { Sidebar } from "./Sidebar";

// The Canvas must never render on the server (no WebGL there).
const Viewport = dynamic(() => import("./Viewport"), {
  ssr: false,
  loading: () => <ViewportSkeleton label="Loading viewport…" />,
});

export default function Studio() {
  const geo = useGeometry();
  const firstLoad = geo.status === "loading" && !geo.geometry;

  return (
    <div className="h-full w-full flex bg-[#0a0b0d]">
      {/* Viewport — ~70% */}
      <div className="relative flex-1 min-w-0">
        <Viewport geometry={geo.geometry} />

        {/* Top status bar */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-4">
          <div className="flex items-center gap-2 rounded-md bg-black/40 backdrop-blur px-2.5 py-1.5 border border-white/5">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                geo.status === "error"
                  ? "bg-red-400"
                  : geo.status === "loading"
                    ? "bg-amber-400 animate-pulse"
                    : "bg-[var(--accent)]"
              }`}
            />
            <span className="text-[11px] font-mono text-zinc-300">
              {geo.status === "error"
                ? "ENGINE ERROR"
                : geo.status === "loading"
                  ? "GENERATING"
                  : "WATERTIGHT"}
            </span>
          </div>
          <div className="text-[11px] font-mono text-zinc-600">
            drag · orbit&nbsp;&nbsp;scroll · zoom
          </div>
        </div>

        {firstLoad && <ViewportSkeleton label="Initializing geometry engine…" />}

        {geo.status === "error" && (
          <div className="absolute inset-x-0 bottom-0 m-4 rounded-lg bg-red-950/70 border border-red-800/60 px-4 py-3 backdrop-blur">
            <p className="text-xs font-semibold text-red-300">Geometry engine error</p>
            <p className="mt-0.5 text-[11px] font-mono text-red-200/80 break-words">
              {geo.error}
            </p>
          </div>
        )}
      </div>

      {/* Parameter sidebar — ~30% */}
      <div className="w-[360px] max-w-[34vw] shrink-0 h-full">
        <Sidebar {...geo} />
      </div>
    </div>
  );
}

function ViewportSkeleton({ label }: { label: string }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-[#0a0b0d]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-7 h-7 rounded-full border-2 border-zinc-700 border-t-[var(--accent)] animate-spin" />
        <p className="text-xs font-mono text-zinc-500">{label}</p>
      </div>
    </div>
  );
}
