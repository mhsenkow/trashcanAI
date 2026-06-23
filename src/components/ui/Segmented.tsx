"use client";

import * as RToggleGroup from "@radix-ui/react-toggle-group";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  hint?: string;
}

interface SegmentedProps<T extends string> {
  label?: string;
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  columns?: number;
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  columns,
}: SegmentedProps<T>) {
  return (
    <div>
      {label && (
        <label className="block text-[11px] uppercase tracking-wider text-zinc-400 mb-1.5">
          {label}
        </label>
      )}
      <RToggleGroup.Root
        type="single"
        value={value}
        onValueChange={(v) => v && onChange(v as T)}
        className="grid gap-1 p-1 rounded-lg bg-zinc-900/80 border border-zinc-800"
        style={{
          gridTemplateColumns: `repeat(${columns ?? options.length}, minmax(0, 1fr))`,
        }}
      >
        {options.map((opt) => (
          <RToggleGroup.Item
            key={opt.value}
            value={opt.value}
            title={opt.hint}
            className="px-2 py-1.5 rounded-md text-xs font-medium text-zinc-400 transition-colors hover:text-zinc-200 data-[state=on]:bg-zinc-700/70 data-[state=on]:text-white data-[state=on]:shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
          >
            {opt.label}
          </RToggleGroup.Item>
        ))}
      </RToggleGroup.Root>
    </div>
  );
}
