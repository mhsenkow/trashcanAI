"use client";

import * as RSlider from "@radix-ui/react-slider";

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}

export function Slider({
  label,
  value,
  min,
  max,
  step,
  unit = "mm",
  disabled = false,
  onChange,
}: SliderProps) {
  return (
    <div className={disabled ? "opacity-40 pointer-events-none" : ""}>
      <div className="flex items-baseline justify-between mb-1.5">
        <label className="text-[11px] uppercase tracking-wider text-zinc-400">
          {label}
        </label>
        <span className="font-mono text-xs text-zinc-200 tabular-nums">
          {value.toFixed(step < 1 ? (step < 0.1 ? 2 : 1) : 0)}
          <span className="text-zinc-500 ml-0.5">{unit}</span>
        </span>
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
          <RSlider.Range className="absolute h-full rounded-full bg-[var(--accent)]" />
        </RSlider.Track>
        <RSlider.Thumb
          aria-label={label}
          className="block w-3.5 h-3.5 rounded-full bg-zinc-100 shadow-md border border-zinc-400/40 outline-none transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-[var(--accent)] cursor-grab active:cursor-grabbing"
        />
      </RSlider.Root>
    </div>
  );
}
