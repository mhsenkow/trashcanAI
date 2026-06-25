"use client";

import * as RSlider from "@radix-ui/react-slider";
import { useEffect, useRef, useState } from "react";

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  disabled?: boolean;
  invalid?: boolean;
  /** Suggested values — rendered as subtle ticks on the track. */
  marks?: number[];
  onChange: (value: number) => void;
  format?: (value: number) => string;
  title?: string;
}

function decimalsForStep(step: number): number {
  if (step >= 1) return 0;
  if (step >= 0.1) return 1;
  return 2;
}

function clampStep(v: number, min: number, max: number, step: number): number {
  const snapped = Math.round(v / step) * step;
  const d = decimalsForStep(step);
  const clamped = Math.min(max, Math.max(min, snapped));
  return Number(clamped.toFixed(d));
}

export function Slider({
  label,
  value,
  min,
  max,
  step,
  unit = "mm",
  disabled = false,
  invalid = false,
  marks,
  onChange,
  format,
  title,
}: SliderProps) {
  const [draft, setDraft] = useState(String(value));
  const dec = decimalsForStep(step);

  useEffect(() => {
    setDraft(value.toFixed(dec));
  }, [value, dec]);

  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (commitTimer.current) clearTimeout(commitTimer.current);
    },
    [],
  );

  const commitDraft = () => {
    if (commitTimer.current) clearTimeout(commitTimer.current);
    const parsed = Number.parseFloat(draft);
    if (Number.isNaN(parsed)) {
      setDraft(value.toFixed(dec));
      return;
    }
    onChange(clampStep(parsed, min, max, step));
  };

  // Apply a typed value shortly after typing stops, so a precise entry takes
  // effect without forcing the user to blur or press Enter.
  const handleType = (raw: string) => {
    setDraft(raw);
    if (commitTimer.current) clearTimeout(commitTimer.current);
    const parsed = Number.parseFloat(raw);
    if (Number.isNaN(parsed)) return;
    commitTimer.current = setTimeout(
      () => onChange(clampStep(parsed, min, max, step)),
      350,
    );
  };

  const markPct = (m: number) =>
    max > min ? `${((clampStep(m, min, max, step) - min) / (max - min)) * 100}%` : "0%";

  return (
    <div className={disabled ? "opacity-40 pointer-events-none" : ""}>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <label
          className={`text-[11px] uppercase tracking-wider shrink-0 ${
            invalid ? "text-red-400" : "text-zinc-400"
          }`}
          title={title}
        >
          {label}
        </label>
        <div className="flex items-center gap-1 min-w-0">
          <input
            type="text"
            inputMode="decimal"
            aria-label={`${label} value`}
            aria-invalid={invalid}
            value={draft}
            disabled={disabled}
            onChange={(e) => handleType(e.target.value)}
            onBlur={commitDraft}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.currentTarget.blur();
                return;
              }
              if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                e.preventDefault();
                const dir = e.key === "ArrowUp" ? 1 : -1;
                onChange(clampStep(value + dir * step, min, max, step));
              }
            }}
            className={`w-[5.25rem] rounded-md border bg-zinc-900/80 px-2 py-1.5 text-right font-mono text-base tabular-nums outline-none ${
              invalid
                ? "border-red-500/70 text-red-300 focus:border-red-400/80"
                : "border-zinc-700/80 text-zinc-100 focus:border-[var(--accent)]/50"
            }`}
          />
          {!format && (
            <span className="text-xs font-mono text-zinc-500 w-5 shrink-0">{unit}</span>
          )}
        </div>
      </div>
      <RSlider.Root
        className="relative flex items-center select-none touch-none w-full h-4"
        value={[value]}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onValueChange={([v]) => onChange(v)}
      >
        <RSlider.Track className="relative grow rounded-full h-[3px] bg-zinc-800">
          {marks?.map((m, i) => (
            <span
              key={`${label}-mark-${i}`}
              className="pointer-events-none absolute top-1/2 -translate-y-1/2 w-0.5 h-2 rounded-full bg-zinc-600/80"
              style={{ left: markPct(m) }}
              aria-hidden
            />
          ))}
          <RSlider.Range
            className={`absolute h-full rounded-full ${
              invalid ? "bg-red-500" : "bg-[var(--accent)]"
            }`}
          />
        </RSlider.Track>
        <RSlider.Thumb
          aria-label={label}
          className={`block w-3.5 h-3.5 rounded-full shadow-md outline-none transition-transform hover:scale-110 focus-visible:ring-2 cursor-grab active:cursor-grabbing ${
            invalid
              ? "bg-red-200 border border-red-400/60 focus-visible:ring-red-400/50"
              : "bg-zinc-100 border border-zinc-400/40 focus-visible:ring-[var(--accent)]"
          }`}
        />
      </RSlider.Root>
    </div>
  );
}
