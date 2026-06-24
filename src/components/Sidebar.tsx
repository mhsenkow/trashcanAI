"use client";

import { useParamStore } from "@/lib/store";
import {
  PARAM_LIMITS,
  type RibOrientation,
  type SurfacingType,
} from "@/lib/types";
import type { GeometryState } from "@/lib/useGeometry";
import { exportPartToStl } from "@/lib/exportStl";
import { PresetBar } from "./PresetBar";
import { Slider } from "./ui/Slider";
import { Segmented } from "./ui/Segmented";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="px-4 py-4 border-b border-zinc-800/80">
      <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500 mb-3">
        {title}
      </h2>
      <div className="space-y-3.5">{children}</div>
    </section>
  );
}

const SURFACING_OPTIONS = [
  { value: "smooth" as const, label: "Smooth", hint: "No surface treatment" },
  { value: "ribbing" as const, label: "Aero-Rib", hint: "Structural ridges — rigidity + dashboard aesthetic" },
  { value: "knurling" as const, label: "Knurl", hint: "Diamond micro-grid — masks layer lines, adds grip" },
  { value: "noise" as const, label: "Noise", hint: "Multi-octave simplex fuzzy-skin baked into the mesh" },
  { value: "hex" as const, label: "Hex", hint: "Hexagonal boss lattice — honeycomb" },
  { value: "cells" as const, label: "Cells", hint: "Voronoi pebbling — organic cellular" },
  { value: "waves" as const, label: "Waves", hint: "Flowing frequency-modulated ripples" },
  { value: "weave" as const, label: "Weave", hint: "Basket weave — over/under threads" },
];

const pct = (v: number) => `${Math.round(v * 100)}%`;

export function Sidebar({ geometry, status, error, builtParams, paramsPending }: GeometryState) {
  const s = useParamStore();
  const radiusMax = Math.min(PARAM_LIMITS.cornerRadius.max, Math.min(s.length, s.width) / 2);
  const smooth = s.surfacing === "smooth";

  const stats = geometry?.stats;
  const ampClamped =
    stats && !smooth && stats.effectiveAmplitude < s.amplitude - 1e-4;

  function exportBody() {
    if (!geometry) return;
    exportPartToStl(
      geometry.body,
      `receptacle_${s.length}x${s.width}x${s.height}_${s.surfacing}`,
    );
  }
  function exportLid() {
    if (!geometry?.lid) return;
    exportPartToStl(geometry.lid, `receptacle_lid_${s.length}x${s.width}`);
  }

  return (
    <aside className="h-full flex flex-col bg-[#0c0e12] border-l border-zinc-800/80 overflow-y-auto">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-zinc-800/80">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-[var(--accent)] shadow-[0_0_8px_var(--accent)]" />
          <h1 className="text-sm font-semibold tracking-tight text-zinc-100">
            Parametric Receptacle
          </h1>
        </div>
        <p className="mt-1 text-[11px] text-zinc-500 pl-4">
          Algorithmic surfacing · production-ready STL
        </p>
        <div className="mt-3 pl-4 pr-1">
          <PresetBar />
        </div>
      </div>

      {/* Dimensions */}
      <Section title="Dimensions">
        <Slider label="Length" value={s.length} {...PARAM_LIMITS.length} onChange={(v) => s.setParam("length", v)} />
        <Slider label="Width" value={s.width} {...PARAM_LIMITS.width} onChange={(v) => s.setParam("width", v)} />
        <Slider label="Height" value={s.height} {...PARAM_LIMITS.height} onChange={(v) => s.setParam("height", v)} />
        <Slider
          label="Corner Radius"
          value={Math.min(s.cornerRadius, radiusMax)}
          min={PARAM_LIMITS.cornerRadius.min}
          max={radiusMax}
          step={PARAM_LIMITS.cornerRadius.step}
          onChange={(v) => s.setParam("cornerRadius", v)}
        />
        <Slider label="Wall Thickness" value={s.wallThickness} {...PARAM_LIMITS.wallThickness} onChange={(v) => s.setParam("wallThickness", v)} />
        <Slider label="Floor Thickness" value={s.floorThickness} {...PARAM_LIMITS.floorThickness} onChange={(v) => s.setParam("floorThickness", v)} />
        <Slider label="Wall Draft" value={s.wallDraft} {...PARAM_LIMITS.wallDraft} unit="°" onChange={(v) => s.setParam("wallDraft", v)} />
        <Slider label="Bottom Radius" value={s.bottomFillet} {...PARAM_LIMITS.bottomFillet} onChange={(v) => s.setParam("bottomFillet", v)} />
        <p className="text-[10px] text-zinc-600 leading-snug">
          Domes the underside and eases wall draft in from the floor — no outward
          shelf at the foot. Larger values need more height (~48% of shorter side).
        </p>
      </Section>

      {/* Mounting Flange */}
      <Section title="Mounting Flange">
        <Slider
          label="Flange Width"
          value={s.flangeWidth}
          {...PARAM_LIMITS.flangeWidth}
          onChange={(v) => s.setParam("flangeWidth", v)}
        />
        <Slider
          label="Flange Thickness"
          value={s.flangeThickness}
          {...PARAM_LIMITS.flangeThickness}
          disabled={s.flangeWidth <= 0}
          onChange={(v) => s.setParam("flangeThickness", v)}
        />
        <p className="text-[10px] text-zinc-600 leading-snug">
          Rim that rests on the cutout edge so the body hangs in the hole. Set
          width to 0 for a plain open box.
        </p>
      </Section>

      {/* Surfacing */}
      <Section title="Algorithmic Surfacing">
        <Segmented
          value={s.surfacing}
          options={SURFACING_OPTIONS}
          onChange={(v: SurfacingType) => s.applySurfacing(v)}
          columns={2}
        />
        {s.surfacing === "ribbing" && (
          <Segmented
            label="Rib Orientation"
            value={s.ribOrientation}
            options={[
              { value: "vertical", label: "Vertical" },
              { value: "horizontal", label: "Horizontal" },
            ]}
            onChange={(v: RibOrientation) => s.setParam("ribOrientation", v)}
          />
        )}
        <Slider
          label={s.surfacing === "noise" ? "Displacement" : "Depth"}
          value={s.amplitude}
          {...PARAM_LIMITS.amplitude}
          disabled={smooth}
          onChange={(v) => s.setParam("amplitude", v)}
        />
        <Slider
          label={s.surfacing === "noise" ? "Noise Scale" : "Pitch"}
          value={s.featureScale}
          {...PARAM_LIMITS.featureScale}
          disabled={smooth}
          onChange={(v) => s.setParam("featureScale", v)}
        />
        <Slider
          label="Sharpness"
          value={s.sharpness}
          {...PARAM_LIMITS.sharpness}
          disabled={smooth}
          format={pct}
          onChange={(v) => s.setParam("sharpness", v)}
        />
        <Slider
          label="Distortion"
          value={s.distortion}
          {...PARAM_LIMITS.distortion}
          disabled={smooth}
          format={pct}
          onChange={(v) => s.setParam("distortion", v)}
        />
        {ampClamped && (
          <p className="text-[10px] leading-snug text-amber-400/90">
            Depth limited to {stats!.effectiveAmplitude.toFixed(2)}mm so features stay valid at this pitch.
          </p>
        )}
      </Section>

      {/* Mesh smoothing */}
      <Section title="Mesh">
        <Slider
          label="Subdivision"
          value={s.smoothing}
          {...PARAM_LIMITS.smoothing}
          unit=""
          format={(v) => (v === 0 ? "Off" : `${v}×`)}
          onChange={(v) => s.setParam("smoothing", v)}
        />
        <p className="text-[10px] text-zinc-600 leading-snug">
          G1 smoothing on the exterior shell before hollowing. Watch{" "}
          <span className="text-zinc-400">Params → In sync</span> and{" "}
          <span className="text-zinc-400">Outer / Triangles</span> to confirm
          updates landed (generation takes ~1–4 s).
        </p>
      </Section>

      {/* Lid */}
      <Section title="Lid">
        <Segmented
          label="Friction-Fit Lid"
          value={s.includeLid ? "on" : "off"}
          options={[
            { value: "on", label: "Generate" },
            { value: "off", label: "Off" },
          ]}
          onChange={(v) => s.setParam("includeLid", v === "on")}
        />
        <Slider
          label="Fit Clearance"
          value={s.lidClearance}
          {...PARAM_LIMITS.lidClearance}
          disabled={!s.includeLid}
          onChange={(v) => s.setParam("lidClearance", v)}
        />
        <Slider
          label="Lip Height"
          value={s.lidLipHeight}
          {...PARAM_LIMITS.lidLipHeight}
          disabled={!s.includeLid}
          onChange={(v) => s.setParam("lidLipHeight", v)}
        />
        <p className="text-[10px] text-zinc-600 leading-snug">
          Clearance tunes the press-fit for your printer. Lip height sets the
          plug depth — 0 makes a flat plate that rests on the rim.
        </p>
      </Section>

      {/* Output / stats / export */}
      <Section title="Output">
        <div className="rounded-lg bg-zinc-900/60 border border-zinc-800 p-3 space-y-2 font-mono text-[11px]">
          <StatRow label="Status" value={statusLabel(status, error, paramsPending)} tone={status === "error" ? "bad" : paramsPending ? "muted" : "good"} />
          <StatRow
            label="Params"
            value={
              !builtParams
                ? "—"
                : paramsPending
                  ? "Updating…"
                  : "In sync"
            }
            tone={paramsPending ? "muted" : "good"}
          />
          <StatRow
            label="Watertight"
            value={stats ? (stats.watertight ? "YES" : "NO") : "—"}
            tone={stats?.watertight ? "good" : "muted"}
          />
          {stats && stats.nakedEdges > 0 && (
            <StatRow
              label="Open edges"
              value={String(stats.nakedEdges)}
              tone="muted"
            />
          )}
          <StatRow
            label="Outer (mm)"
            value={stats ? stats.outerDims.map((d) => d.toFixed(1)).join(" × ") : "—"}
          />
          <StatRow
            label="Cutout (min)"
            value={stats ? `${stats.cutout[0].toFixed(1)} × ${stats.cutout[1].toFixed(1)}` : "—"}
          />
          <StatRow
            label="Triangles"
            value={stats ? (stats.bodyTriangles + stats.lidTriangles).toLocaleString() : "—"}
          />
          <StatRow label="Gen time" value={stats ? `${stats.genMs.toFixed(0)} ms` : "—"} />
          {stats?.densityClamped && (
            <p className="text-[10px] leading-snug text-amber-400/90 pt-1">
              Mesh density capped for performance — increase pitch for finer detail.
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            onClick={exportBody}
            disabled={!geometry || status === "loading"}
            className="px-3 py-2 rounded-md text-xs font-semibold bg-[var(--accent)] text-zinc-950 hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            Export Body
          </button>
          <button
            onClick={exportLid}
            disabled={!geometry?.lid || status === "loading"}
            className="px-3 py-2 rounded-md text-xs font-semibold border border-zinc-700 text-zinc-200 hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            Export Lid
          </button>
        </div>
        <p className="text-[10px] text-zinc-600 leading-snug">
          Binary STL · millimetres · watertight off the build plate.
        </p>
      </Section>

      <div className="px-4 py-3 mt-auto">
        <button
          onClick={() => s.reset()}
          className="w-full px-3 py-2 rounded-md text-xs text-zinc-400 border border-zinc-800 hover:text-zinc-200 hover:border-zinc-700 transition"
        >
          Reset to defaults
        </button>
      </div>
    </aside>
  );
}

function statusLabel(
  status: GeometryState["status"],
  error: string | null,
  paramsPending: boolean,
): string {
  if (status === "error") return error ? truncate(error, 22) : "ERROR";
  if (paramsPending) return "GENERATING…";
  return "READY";
}

function truncate(str: string, n: number): string {
  return str.length > n ? str.slice(0, n - 1) + "…" : str;
}

function StatRow({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "good" | "bad" | "muted";
}) {
  const color =
    tone === "good"
      ? "text-[var(--accent)]"
      : tone === "bad"
        ? "text-red-400"
        : tone === "muted"
          ? "text-zinc-500"
          : "text-zinc-200";
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-zinc-500">{label}</span>
      <span className={`${color} tabular-nums text-right`}>{value}</span>
    </div>
  );
}
