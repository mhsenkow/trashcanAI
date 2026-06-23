"use client";

import clsx from "clsx";
import { type ViewPreset } from "@/lib/viewPresets";
import { useViewStore } from "@/lib/viewStore";

function ViewIcon({ preset, className }: { preset: ViewPreset; className?: string }) {
  const s = "currentColor";
  const stroke = 1.5;
  switch (preset) {
    case "top":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden>
          <rect x="5" y="5" width="14" height="14" rx="1.5" stroke={s} strokeWidth={stroke} />
          <path d="M8 9h8M8 12h8M8 15h5" stroke={s} strokeWidth={stroke} strokeLinecap="round" />
        </svg>
      );
    case "bottom":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden>
          <rect x="5" y="5" width="14" height="14" rx="1.5" stroke={s} strokeWidth={stroke} />
          <circle cx="12" cy="12" r="2.5" stroke={s} strokeWidth={stroke} />
        </svg>
      );
    case "front":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden>
          <path d="M6 8h12v10H6z" stroke={s} strokeWidth={stroke} />
          <path d="M9 11h6M9 14h4" stroke={s} strokeWidth={stroke} strokeLinecap="round" />
        </svg>
      );
    case "back":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden>
          <path d="M6 8h12v10H6z" stroke={s} strokeWidth={stroke} strokeDasharray="3 2" />
        </svg>
      );
    case "left":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden>
          <path d="M8 6v12l8-6-8-6z" stroke={s} strokeWidth={stroke} strokeLinejoin="round" />
        </svg>
      );
    case "right":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden>
          <path d="M16 6v12L8 12l8-6z" stroke={s} strokeWidth={stroke} strokeLinejoin="round" />
        </svg>
      );
    case "iso":
    default:
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden>
          <path
            d="M12 4.5L18.5 8v7L12 18.5 5.5 15V8L12 4.5z"
            stroke={s}
            strokeWidth={stroke}
            strokeLinejoin="round"
          />
          <path d="M12 4.5v14M5.5 8l6.5 3.5M18.5 8L12 11.5" stroke={s} strokeWidth={stroke} opacity={0.55} />
        </svg>
      );
  }
}

function Cell({
  preset,
  active,
  onClick,
  label,
  className,
}: {
  preset?: ViewPreset;
  active: boolean;
  onClick: () => void;
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={clsx(
        "pointer-events-auto flex flex-col items-center justify-center gap-0.5 rounded-md border transition h-10",
        active
          ? "border-[var(--accent)]/60 bg-[var(--accent)]/15 text-white"
          : "border-white/8 bg-black/40 text-zinc-400 hover:border-white/20 hover:text-zinc-100",
        className,
      )}
    >
      {preset ? (
        <ViewIcon preset={preset} className="h-4 w-4" />
      ) : (
        <span className="text-sm leading-none">⤢</span>
      )}
      <span className="text-[8px] font-mono uppercase tracking-wide opacity-80">{label}</span>
    </button>
  );
}

/**
 * Single view-cube widget — orthographic presets in one place (no duplicate toolbar).
 * Layout mirrors a CAD view cube: faces around iso, frame in the corner.
 */
export function ViewCube() {
  const activePreset = useViewStore((s) => s.activePreset);
  const setView = useViewStore((s) => s.setView);
  const reframe = useViewStore((s) => s.reframe);

  const go = (id: ViewPreset) => () => setView(id);
  const on = (id: ViewPreset) => activePreset === id;

  return (
    <div className="pointer-events-auto rounded-lg bg-black/45 backdrop-blur p-2 border border-white/5 w-[148px]">
      <p className="px-0.5 pb-1.5 text-[9px] font-mono uppercase tracking-wider text-zinc-500">
        Camera
      </p>
      <div className="grid grid-cols-3 gap-1">
        <Cell preset="front" label="Front" active={on("front")} onClick={go("front")} />
        <Cell preset="top" label="Top" active={on("top")} onClick={go("top")} />
        <Cell preset="back" label="Back" active={on("back")} onClick={go("back")} />
        <Cell preset="left" label="Left" active={on("left")} onClick={go("left")} />
        <Cell preset="iso" label="Iso" active={on("iso")} onClick={go("iso")} />
        <Cell preset="right" label="Right" active={on("right")} onClick={go("right")} />
        <div className="col-span-2">
          <Cell
            preset="bottom"
            label="Bottom"
            active={on("bottom")}
            onClick={go("bottom")}
            className="w-full h-10"
          />
        </div>
        <Cell label="Frame" active={false} onClick={() => reframe()} className="h-10" />
      </div>
    </div>
  );
}

/** @deprecated use ViewCube */
export function ViewNavigator() {
  return <ViewCube />;
}

/** @deprecated removed — views live in ViewCube only */
export function ViewToolbar() {
  return null;
}
