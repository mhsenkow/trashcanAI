"use client";

import { useMemo, useState } from "react";
import { useParamStore } from "@/lib/store";
import {
  baseEdgeLabel,
  evaluateBaseEdge,
  evaluateTopEdge,
} from "@/lib/paramValidation";
import { deriveParamSpecs } from "@/lib/paramDerivation";
import {
  PARAM_LIMITS,
  type BaseEdgeType,
  type RibOrientation,
  type SurfacingType,
} from "@/lib/types";
import { surfacingConcept, SURFACING_CONCEPTS } from "@/lib/geometry/surfacingConcepts";
import type { GeometryState } from "@/lib/useGeometry";
import { exportPartToStl } from "@/lib/exportStl";
import {
  MATERIALS,
  MATERIAL_IDS,
  FIT_LABELS,
  wallLineCount,
  snapWallToLines,
  wallIsOnLineMultiple,
  solidLayers,
  filamentLengthMm,
  massGrams,
  printMinutes,
  formatDuration,
  type FitClass,
  type MaterialId,
} from "@/lib/printProfiles";
import { usePrinterStore, NOZZLE_OPTIONS, LAYER_OPTIONS } from "@/lib/printStore";
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

const SURFACING_OPTIONS = (
  Object.entries(SURFACING_CONCEPTS) as [SurfacingType, (typeof SURFACING_CONCEPTS)[SurfacingType]][]
).map(([value, c]) => ({
  value,
  label: c.name,
  hint: c.hint,
}));

const pct = (v: number) => `${Math.round(v * 100)}%`;

export function Sidebar({
  geometry,
  status,
  error,
  paramsPending,
  exporting,
  exportFullQuality,
}: GeometryState) {
  const s = useParamStore();
  const derived = useMemo(() => deriveParamSpecs(s), [s.paramsVersion, s.surfacing]);
  const concept = surfacingConcept(s.surfacing);
  const smooth = s.surfacing === "smooth";
  const baseEdge = evaluateBaseEdge(s);
  const baseEdgeActive = s.baseEdgeType !== "none";
  const topEdge = evaluateTopEdge(s);
  const topEdgeActive = s.topEdgeType !== "none";
  const hasBrim = s.flangeWidth > 0.05;
  // Mirror engine.ts `rEff`: a big foot edge rounds the vertical corners with it.
  const effectiveCorner = baseEdgeActive
    ? Math.min(
        Math.min(s.length, s.width) / 2,
        Math.max(s.cornerRadius, baseEdge.effectiveSize * 1.12),
      )
    : s.cornerRadius;
  const [exportError, setExportError] = useState<string | null>(null);

  const stats = geometry?.stats;
  const ampClamped =
    stats && !smooth && stats.effectiveAmplitude < s.amplitude - 1e-4;

  // --- Print-readiness derivations ---
  const printer = usePrinterStore();
  const mat = MATERIALS[s.material];
  const wallLines = wallLineCount(s.wallThickness, printer.nozzle);
  const wallClean = wallIsOnLineMultiple(s.wallThickness, printer.nozzle);
  const wallSnapTarget = snapWallToLines(s.wallThickness, printer.nozzle);
  const floorLayers = solidLayers(s.floorThickness, printer.layerHeight);
  const minWallOk = s.wallThickness >= mat.minWall - 1e-4;
  // Min printable surfacing feature: amplitude below ~1 line width won't resolve.
  const featureTooFine =
    !smooth && stats != null && stats.effectiveAmplitude > 0 &&
    stats.effectiveAmplitude < printer.nozzle * 0.75;
  // Warp risk: large flat footprint + a shrink-prone material.
  const footprintCm2 = (s.length * s.width) / 100;
  const warpProne = ["abs", "asa", "nylon"].includes(s.material);
  const warpRisk = warpProne && footprintCm2 > 150;
  // Print estimates from the printed solid volume.
  const totalVol = stats ? stats.bodyVolume + stats.lidVolume : 0;
  const massG = totalVol > 0 ? massGrams(totalVol, s.material) : 0;
  const filamentM = totalVol > 0 ? filamentLengthMm(totalVol) / 1000 : 0;
  const printTime = totalVol > 0 ? printMinutes(totalVol, printer.layerHeight, printer.nozzle) : 0;

  async function exportBody() {
    if (!geometry || exporting) return;
    setExportError(null);
    const full = await exportFullQuality();
    if (!full) {
      setExportError("Export mesh failed — try again.");
      return;
    }
    exportPartToStl(
      full.body,
      `receptacle_${s.length}x${s.width}x${s.height}_${s.surfacing}`,
    );
  }
  async function exportLid() {
    if (!geometry?.lid || exporting) return;
    setExportError(null);
    const full = await exportFullQuality();
    if (!full?.lid) {
      setExportError("Export mesh failed — try again.");
      return;
    }
    exportPartToStl(full.lid, `receptacle_lid_${s.length}x${s.width}`);
  }

  return (
    <aside className="h-full flex flex-col bg-[#0c0e12] border-l border-zinc-800/80 overflow-y-auto">
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

      <Section title="Dimensions">
        <p className="text-[10px] text-zinc-600 leading-snug -mt-1 mb-1">
          Length, width, height, and wall thickness set the feasible range for pitch,
          depth, flange, and lip — ticks on other sliders mark suggested values.
        </p>
        <Slider label="Length" value={s.length} {...PARAM_LIMITS.length} onChange={(v) => s.setParam("length", v)} />
        <Slider label="Width" value={s.width} {...PARAM_LIMITS.width} onChange={(v) => s.setParam("width", v)} />
        <Slider label="Height" value={s.height} {...PARAM_LIMITS.height} onChange={(v) => s.setParam("height", v)} />
        <Slider
          label="Corner Radius"
          value={Math.min(s.cornerRadius, derived.cornerRadius.max)}
          min={derived.cornerRadius.min}
          max={derived.cornerRadius.max}
          step={derived.cornerRadius.step}
          marks={derived.cornerRadius.marks}
          invalid={derived.cornerRadius.invalid}
          onChange={(v) => s.setParam("cornerRadius", v)}
        />
        {effectiveCorner > s.cornerRadius + 0.2 && (
          <p className="text-[10px] text-zinc-600 leading-snug -mt-1.5">
            Rounded to ~{effectiveCorner.toFixed(0)} mm so the base edge stays a
            clean mesh — vertical corners round up with the foot.
          </p>
        )}
        <Slider
          label="Wall Thickness"
          value={s.wallThickness}
          {...PARAM_LIMITS.wallThickness}
          marks={[1, 1.5, 2, 3, 4]}
          invalid={!minWallOk}
          onChange={(v) => s.setParam("wallThickness", v)}
        />
        <p className="text-[10px] leading-snug -mt-1.5 flex items-center justify-between gap-2">
          <span className={wallClean ? "text-zinc-600" : "text-amber-400/90"}>
            {!minWallOk
              ? `Below ${mat.name} min wall (${mat.minWall} mm)`
              : wallClean
                ? `= ${wallLines} perimeter${wallLines > 1 ? "s" : ""} @ ${printer.nozzle} mm`
                : `Off-perimeter — slicer will gap-fill`}
          </span>
          {!wallClean && (
            <button
              onClick={() => s.setParam("wallThickness", wallSnapTarget)}
              className="shrink-0 text-[var(--accent)] hover:underline"
            >
              snap → {wallSnapTarget}
            </button>
          )}
        </p>
        <Slider
          label="Floor Thickness"
          value={s.floorThickness}
          min={derived.floorThickness.min}
          max={derived.floorThickness.max}
          step={derived.floorThickness.step}
          marks={derived.floorThickness.marks}
          invalid={derived.floorThickness.invalid}
          onChange={(v) => s.setParam("floorThickness", v)}
        />
        <p className="text-[10px] leading-snug -mt-1.5 text-zinc-600">
          = {floorLayers} solid layer{floorLayers > 1 ? "s" : ""} @ {printer.layerHeight} mm
        </p>
        <Slider label="Wall Draft" value={s.wallDraft} {...PARAM_LIMITS.wallDraft} unit="°" onChange={(v) => s.setParam("wallDraft", v)} />
      </Section>

      <Section title="Base Edge">
        <Segmented
          label="Wall–floor edge"
          value={s.baseEdgeType}
          options={[
            { value: "none", label: "None", hint: "Sharp 90° junction" },
            { value: "fillet", label: "Fillet", hint: "Round cut into the exterior foot" },
            { value: "chamfer", label: "Chamfer", hint: "45° cut into the exterior foot" },
          ]}
          onChange={(v: BaseEdgeType) => s.setParam("baseEdgeType", v)}
          columns={3}
        />
        <Slider
          label={baseEdgeLabel(s.baseEdgeType)}
          value={s.baseEdgeSize}
          min={derived.baseEdgeSize.min}
          max={Math.min(PARAM_LIMITS.baseEdgeSize.max, baseEdge.maxSize)}
          step={derived.baseEdgeSize.step}
          marks={derived.baseEdgeSize.marks}
          disabled={!baseEdgeActive}
          invalid={derived.baseEdgeSize.invalid}
          onChange={(v) => s.setParam("baseEdgeSize", v)}
        />
        {baseEdgeActive && (
          <p className="text-[10px] text-zinc-600 leading-snug -mt-1">
            {derived.baseEdgeSize.invalid ? (
              <span className="text-red-400/95">{derived.baseEdgeSize.reason}</span>
            ) : (
              <>
                Rounds (fillet) or bevels (chamfer) the exterior wall–floor
                corner for a print-friendly foot. The inside bottom rounds to
                match, so the wall stays constant-thickness. Up to{" "}
                {baseEdge.maxSize.toFixed(0)} mm at this footprint.
              </>
            )}
          </p>
        )}
      </Section>

      <Section title="Top Edge">
        <Segmented
          label={hasBrim ? "Wall → brim" : "Top rim"}
          value={s.topEdgeType}
          options={[
            { value: "none", label: "None", hint: "Sharp 90° junction" },
            {
              value: "fillet",
              label: "Fillet",
              hint: hasBrim ? "Round cove into the brim" : "Round the top rim",
            },
            {
              value: "chamfer",
              label: "Chamfer",
              hint: hasBrim ? "45° cove into the brim" : "45° bevel on the rim",
            },
          ]}
          onChange={(v: BaseEdgeType) => s.setParam("topEdgeType", v)}
          columns={3}
        />
        <Slider
          label={baseEdgeLabel(s.topEdgeType)}
          value={s.topEdgeSize}
          min={derived.topEdgeSize.min}
          max={Math.min(PARAM_LIMITS.topEdgeSize.max, topEdge.maxSize)}
          step={derived.topEdgeSize.step}
          marks={derived.topEdgeSize.marks}
          disabled={!topEdgeActive}
          invalid={derived.topEdgeSize.invalid}
          onChange={(v) => s.setParam("topEdgeSize", v)}
        />
        {topEdgeActive && (
          <p className="text-[10px] text-zinc-600 leading-snug -mt-1">
            {derived.topEdgeSize.invalid ? (
              <span className="text-red-400/95">{derived.topEdgeSize.reason}</span>
            ) : hasBrim ? (
              <>
                Curves the wall into the brim underside instead of a sharp
                corner — a smooth cove. Up to {topEdge.maxSize.toFixed(0)} mm
                within the brim.
              </>
            ) : (
              <>
                Rounds or bevels the open top rim. Add a mounting flange to cove
                the wall into a brim instead.
              </>
            )}
          </p>
        )}
      </Section>

      <Section title="Base & Floor">
        <Segmented
          label="Underside"
          value={s.footRing ? "ring" : "flat"}
          options={[
            { value: "flat", label: "Flat", hint: "Full bottom contacts the bed" },
            { value: "ring", label: "Foot ring", hint: "Recessed — only the rim touches" },
          ]}
          onChange={(v) => s.setParam("footRing", v === "ring")}
          columns={2}
        />
        <p className="text-[10px] text-zinc-600 leading-snug -mt-1">
          A recessed foot ring cuts bed contact (less warp, no rock). A small base
          chamfer also relieves first-layer &ldquo;elephant&rsquo;s foot&rdquo;.
        </p>
        <Slider
          label="Interior Fillet"
          value={s.interiorFillet}
          {...PARAM_LIMITS.interiorFillet}
          marks={[2, 4, 6, 8, 10]}
          onChange={(v) => s.setParam("interiorFillet", v)}
        />
        <p className="text-[10px] text-zinc-600 leading-snug -mt-1.5">
          Rounds the inside wall-to-floor corner — stronger and easier to clean
          out, independent of the exterior foot.
        </p>
        <Segmented
          label="Drainage holes"
          value={s.drainHoles ? "on" : "off"}
          options={[
            { value: "off", label: "None" },
            { value: "on", label: "Holes", hint: "Weep holes through the floor" },
          ]}
          onChange={(v) => s.setParam("drainHoles", v === "on")}
          columns={2}
        />
        {s.drainHoles && (
          <Slider
            label="Hole Diameter"
            value={s.drainHoleDiameter}
            {...PARAM_LIMITS.drainHoleDiameter}
            marks={[3, 5, 8, 12]}
            onChange={(v) => s.setParam("drainHoleDiameter", v)}
          />
        )}
      </Section>

      <Section title="Mounting Flange">
        <Slider
          label="Flange Width"
          value={s.flangeWidth}
          min={derived.flangeWidth.min}
          max={derived.flangeWidth.max}
          step={derived.flangeWidth.step}
          marks={derived.flangeWidth.marks}
          invalid={derived.flangeWidth.invalid}
          onChange={(v) => s.setParam("flangeWidth", v)}
        />
        <Slider
          label="Flange Thickness"
          value={s.flangeThickness}
          {...PARAM_LIMITS.flangeThickness}
          marks={derived.flangeThickness.marks}
          disabled={s.flangeWidth <= 0}
          onChange={(v) => s.setParam("flangeThickness", v)}
        />
        <p className="text-[10px] text-zinc-600 leading-snug">
          Rim for drop-in mounting. The inner shelf is solid material (not a gap) —
          one watertight shell for slicing. Set width to 0 for a plain open box.
        </p>
      </Section>

      <Section title="Algorithmic Surfacing">
        <Segmented
          value={s.surfacing}
          options={SURFACING_OPTIONS}
          onChange={(v: SurfacingType) => s.applySurfacing(v)}
          columns={2}
        />
        {!smooth && (
          <p className="text-[10px] text-zinc-600 leading-snug -mt-1">{concept.blurb}</p>
        )}
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
          label={concept.amplitudeLabel}
          value={s.amplitude}
          min={derived.amplitude.min}
          max={derived.amplitude.max}
          step={derived.amplitude.step}
          marks={derived.amplitude.marks}
          disabled={smooth}
          invalid={derived.amplitude.invalid}
          onChange={(v) => s.setParam("amplitude", v)}
        />
        <Slider
          label={concept.pitchLabel}
          value={s.featureScale}
          min={derived.featureScale.min}
          max={derived.featureScale.max}
          step={derived.featureScale.step}
          marks={derived.featureScale.marks}
          disabled={smooth}
          invalid={derived.featureScale.invalid}
          onChange={(v) => s.setParam("featureScale", v)}
        />
        <Slider
          label={concept.sharpnessLabel}
          value={s.sharpness}
          {...PARAM_LIMITS.sharpness}
          marks={derived.sharpness.marks}
          disabled={smooth}
          format={pct}
          onChange={(v) => s.setParam("sharpness", v)}
        />
        <Slider
          label={concept.distortionLabel}
          value={s.distortion}
          {...PARAM_LIMITS.distortion}
          marks={derived.distortion.marks}
          disabled={smooth || !concept.distortionUseful}
          format={pct}
          onChange={(v) => s.setParam("distortion", v)}
        />
        {(ampClamped || derived.amplitude.invalid) && (
          <p className="text-[10px] leading-snug text-amber-400/90">
            {derived.amplitude.reason ??
              `Depth limited to ${stats?.effectiveAmplitude.toFixed(2) ?? derived.effectiveAmplitudeCap.toFixed(2)} mm so features stay watertight at this pitch.`}
          </p>
        )}
      </Section>

      <Section title="Mesh">
        <Slider
          label="Subdivision"
          value={s.smoothing}
          min={derived.smoothing.min}
          max={PARAM_LIMITS.smoothing.max}
          step={derived.smoothing.step}
          marks={derived.smoothing.marks}
          unit=""
          invalid={derived.smoothing.invalid}
          format={(v) => (v === 0 ? "Off" : `${v}×`)}
          onChange={(v) => s.setParam("smoothing", v)}
        />
        <p className="text-[10px] text-zinc-600 leading-snug -mt-1">
          {derived.smoothing.invalid
            ? derived.smoothing.reason
            : "Catmull-Clark passes on the exported STL. The on-screen preview stays coarse for speed — export to see the smoothed result."}
        </p>
      </Section>

      <Section title="Print Setup">
        <Segmented
          label="Material"
          value={s.material}
          options={MATERIAL_IDS.map((id) => ({
            value: id,
            label: MATERIALS[id].name,
            hint: MATERIALS[id].note,
          }))}
          onChange={(v) => s.setParam("material", v as MaterialId)}
          columns={3}
        />
        <p className="text-[10px] leading-snug -mt-1 text-zinc-600">{mat.note}</p>
        <Segmented
          label={`Nozzle / line width`}
          value={String(printer.nozzle)}
          options={NOZZLE_OPTIONS.map((n) => ({ value: String(n), label: `${n}` }))}
          onChange={(v) => printer.setNozzle(parseFloat(v))}
          columns={4}
        />
        <Segmented
          label="Layer height"
          value={String(printer.layerHeight)}
          options={LAYER_OPTIONS.map((n) => ({ value: String(n), label: `${n}` }))}
          onChange={(v) => printer.setLayerHeight(parseFloat(v))}
          columns={5}
        />
        <Segmented
          label="Shrink compensation"
          value={s.compensateShrink ? "on" : "off"}
          options={[
            { value: "off", label: "Off", hint: "Export at nominal size" },
            {
              value: "on",
              label: `On +${(mat.shrinkage * 100).toFixed(1)}%`,
              hint: `Up-scale so ${mat.name} lands on-size after cooling`,
            },
          ]}
          onChange={(v) => s.setParam("compensateShrink", v === "on")}
          columns={2}
        />
      </Section>

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
        <Segmented
          label="Fit"
          value={s.lidFit}
          options={(["press", "snug", "slip"] as FitClass[]).map((f) => ({
            value: f,
            label: FIT_LABELS[f],
            hint: `${mat.name}: ${mat.fit[f].toFixed(2)} mm clearance`,
          }))}
          onChange={(v) => s.setParam("lidFit", v as FitClass)}
          columns={3}
        />
        <Slider
          label="Fit Clearance"
          value={s.lidClearance}
          {...PARAM_LIMITS.lidClearance}
          marks={derived.lidClearance.marks}
          disabled={!s.includeLid}
          onChange={(v) => s.setParam("lidClearance", v)}
        />
        <p className="text-[10px] leading-snug -mt-1.5 text-zinc-600">
          {FIT_LABELS[s.lidFit]} fit for {mat.name} ≈ {mat.fit[s.lidFit].toFixed(2)} mm.
          Fine-tune above, or print the tolerance test strip to dial in your printer.
        </p>
        <Slider
          label="Lip Height"
          value={s.lidLipHeight}
          min={derived.lidLipHeight.min}
          max={derived.lidLipHeight.max}
          step={derived.lidLipHeight.step}
          marks={derived.lidLipHeight.marks}
          disabled={!s.includeLid}
          invalid={derived.lidLipHeight.invalid}
          onChange={(v) => s.setParam("lidLipHeight", v)}
        />
      </Section>

      <Section title="Output">
        <div className="rounded-lg bg-zinc-900/60 border border-zinc-800 p-3 space-y-2 font-mono text-[11px]">
          <StatRow label="Status" value={statusLabel(status, error, paramsPending, exporting)} tone={status === "error" ? "bad" : paramsPending || exporting ? "muted" : "good"} />
          <StatRow
            label="Shell valid"
            value={stats ? (stats.watertight ? "YES" : "NO") : "—"}
            tone={stats?.watertight ? "good" : "muted"}
          />
          {stats && stats.rimEdges > 0 && (
            <StatRow label="Rim (open top)" value={String(stats.rimEdges)} tone="muted" />
          )}
          {stats && stats.defectEdges > 0 && (
            <StatRow label="Mesh defects" value={String(stats.defectEdges)} tone="bad" />
          )}
          {stats && stats.nonManifoldEdges > 0 && (
            <StatRow label="Non-manifold" value={String(stats.nonManifoldEdges)} tone="bad" />
          )}
          <StatRow
            label="Min wall"
            value={`${s.wallThickness.toFixed(1)} mm`}
            tone={minWallOk ? (wallClean ? "good" : "muted") : "bad"}
          />
          <StatRow
            label="Outer (mm)"
            value={
              stats
                ? stats.outerDims.map((d) => d.toFixed(1)).join(" × ") +
                  (s.compensateShrink ? "*" : "")
                : "—"
            }
          />
          <StatRow
            label="Triangles"
            value={stats ? (stats.bodyTriangles + stats.lidTriangles).toLocaleString() : "—"}
          />
          <StatRow label="Gen time" value={stats ? `${stats.genMs.toFixed(0)} ms` : "—"} />

          <div className="h-px bg-zinc-800 my-1" />
          <StatRow label="Material" value={`${mat.name} · ${FIT_LABELS[s.lidFit].toLowerCase()} fit`} />
          <StatRow label="Filament" value={filamentM > 0 ? `${filamentM.toFixed(2)} m` : "—"} />
          <StatRow label="Est. mass" value={massG > 0 ? `${massG.toFixed(0)} g` : "—"} />
          <StatRow label="Est. time" value={printTime > 0 ? `~${formatDuration(printTime)}` : "—"} />
          {s.compensateShrink && (
            <p className="text-[10px] leading-snug text-zinc-500 pt-0.5">
              * exported {((mat.shrinkage) * 100).toFixed(1)}% larger to offset {mat.name} shrinkage.
            </p>
          )}
          {warpRisk && (
            <p className="text-[10px] leading-snug text-amber-400/90 pt-1">
              Large {mat.name} footprint ({footprintCm2.toFixed(0)} cm²) — watch for corner
              warp. Use a brim, an enclosure, and good bed adhesion.
            </p>
          )}
          {featureTooFine && (
            <p className="text-[10px] leading-snug text-amber-400/90 pt-1">
              Surfacing depth ({stats?.effectiveAmplitude.toFixed(2)} mm) is below your
              {" "}{printer.nozzle} mm line width — it won&apos;t print crisply.
            </p>
          )}
          {stats && stats.rimEdges > 0 && stats.defectEdges === 0 && (
            <p className="text-[10px] leading-snug text-zinc-500 pt-1">
              Rim edges are normal — the insert is open at the top. Shell defects should stay at 0.
            </p>
          )}
          <p className="text-[10px] leading-snug text-zinc-500 pt-1">
            On-screen mesh is a fast preview. Export builds full-resolution STL on demand (~20–30s).
          </p>
          {exportError && (
            <p className="text-[10px] leading-snug text-red-400 pt-1">{exportError}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            onClick={() => void exportBody()}
            disabled={!geometry || status === "loading" || paramsPending || exporting}
            className="px-3 py-2 rounded-md text-xs font-semibold bg-[var(--accent)] text-zinc-950 hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            {exporting ? "Building STL…" : "Export Body"}
          </button>
          <button
            onClick={() => void exportLid()}
            disabled={!geometry?.lid || status === "loading" || paramsPending || exporting}
            className="px-3 py-2 rounded-md text-xs font-semibold border border-zinc-700 text-zinc-200 hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            {exporting ? "Building STL…" : "Export Lid"}
          </button>
        </div>
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
  exporting: boolean,
): string {
  if (status === "error") return error ? truncate(error, 22) : "ERROR";
  if (exporting) return "EXPORTING…";
  if (paramsPending) return "UPDATING…";
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
