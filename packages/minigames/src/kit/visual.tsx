"use client";
import { AnimatePresence, motion } from "framer-motion";
import type { CSSProperties, ReactNode } from "react";

/**
 * Shared look for mini-games: a framed "arena" with a themed backdrop, a HUD row of stat pills,
 * a draining time bar, round dots and pop-up feedback text. Keeps every game visually related
 * while each one picks its own colours and scenery.
 */

/** A themed play area: gradient backdrop, soft inner glow, rounded frame. */
export function Arena({
  children,
  tone = "#7b5cff",
  bg,
  className = "",
  style,
  pattern = "dots",
}: {
  children: ReactNode;
  /** Accent colour used for the frame glow. */
  tone?: string;
  /** Custom background (CSS). Defaults to a dark gradient tinted with `tone`. */
  bg?: string;
  className?: string;
  style?: CSSProperties;
  pattern?: "dots" | "grid" | "none" | "stripes";
}) {
  const pat =
    pattern === "dots"
      ? "radial-gradient(#ffffff14 1.2px, transparent 1.3px) 0 0 / 18px 18px"
      : pattern === "grid"
        ? "linear-gradient(#ffffff0d 1px, transparent 1px) 0 0 / 100% 28px, linear-gradient(90deg, #ffffff0d 1px, transparent 1px) 0 0 / 28px 100%"
        : pattern === "stripes"
          ? "repeating-linear-gradient(135deg, #ffffff08 0 14px, transparent 14px 28px)"
          : "none";
  return (
    <div
      className={`relative overflow-hidden rounded-[28px] ${className}`}
      style={{
        background: `${pat === "none" ? "" : `${pat}, `}${bg ?? `radial-gradient(120% 90% at 50% 0%, ${tone}40 0%, transparent 60%), linear-gradient(180deg, #1d1838 0%, #120f24 100%)`}`,
        boxShadow: `inset 0 0 0 2px ${tone}55, inset 0 -18px 40px #00000055, 0 10px 30px #00000066`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** Small rounded stat chip for HUD rows. */
export function Pill({
  children,
  tone,
  className = "",
  pulse = false,
}: {
  children: ReactNode;
  tone?: string;
  className?: string;
  pulse?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-display text-lg leading-none tabular-nums ${pulse ? "animate-pulse" : ""} ${className}`}
      style={{
        background: tone ? `${tone}26` : "#ffffff12",
        boxShadow: `inset 0 0 0 1.5px ${tone ? `${tone}88` : "#ffffff22"}`,
        color: tone ?? undefined,
      }}
    >
      {children}
    </span>
  );
}

/** HUD row: items on the left, items on the right. */
export function Hud({ left, right, center }: { left?: ReactNode; right?: ReactNode; center?: ReactNode }) {
  return (
    <div className="flex min-h-9 items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-2">{left}</div>
      {center && <div className="flex items-center gap-2">{center}</div>}
      <div className="flex flex-wrap items-center justify-end gap-2">{right}</div>
    </div>
  );
}

/** Seconds countdown pill that turns red and pulses for the last 5 seconds. */
export function SecondsPill({ ms }: { ms: number }) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const low = ms < 5000;
  return (
    <Pill tone={low ? "#ff4d5e" : "#a29cc6"} pulse={low}>
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden>
        <circle cx="12" cy="13" r="8" />
        <path d="M12 9v4l2.5 2M9.5 2.5h5" />
      </svg>
      {s}s
    </Pill>
  );
}

/** Thin draining bar for local timers. */
export function TimeBar({ left, total, className = "" }: { left: number; total: number; className?: string }) {
  const f = Math.max(0, Math.min(1, left / Math.max(1, total)));
  const color = f > 0.5 ? "#2fd27a" : f > 0.2 ? "#ffc933" : "#ff4d5e";
  return (
    <div className={`h-2.5 w-full overflow-hidden rounded-full bg-black/40 ${className}`} role="progressbar" aria-valuenow={Math.round(f * 100)}>
      <div
        className="h-full rounded-full transition-[width] duration-100 ease-linear"
        style={{ width: `${f * 100}%`, background: color, boxShadow: `0 0 10px ${color}` }}
      />
    </div>
  );
}

/** Progress dots: done (filled), current (ring), upcoming (dim). Optional per-round colours. */
export function RoundDots({ total, done, colors }: { total: number; done: number; colors?: (string | undefined)[] }) {
  return (
    <span className="inline-flex items-center gap-1.5" aria-label={`Round ${Math.min(done + 1, total)} of ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className="h-2.5 w-2.5 rounded-full transition-all"
          style={{
            background: i < done ? (colors?.[i] ?? "#ffc933") : i === done ? "transparent" : "#ffffff22",
            boxShadow: i === done ? "0 0 0 2px #ffc933" : undefined,
            transform: i === done ? "scale(1.25)" : undefined,
          }}
        />
      ))}
    </span>
  );
}

/**
 * Feedback text that pops up and floats away ("+1", "PERFECT!", "Miss").
 * Change `id` to fire a new pop.
 */
export function PopText({ id, text, color = "#ffc933", className = "" }: { id: string | number | null; text: ReactNode; color?: string; className?: string }) {
  return (
    <AnimatePresence>
      {id !== null && (
        <motion.span
          key={id}
          initial={{ opacity: 0, y: 10, scale: 0.6 }}
          animate={{ opacity: [0, 1, 1, 0], y: [10, 0, -10, -36], scale: [0.6, 1.15, 1, 1] }}
          transition={{ duration: 0.9, times: [0, 0.15, 0.6, 1] }}
          className={`pointer-events-none absolute z-20 font-display text-4xl drop-shadow-[0_3px_0_#0008] ${className}`}
          style={{ color }}
        >
          {text}
        </motion.span>
      )}
    </AnimatePresence>
  );
}

/** Chunky 3D button in any colour. */
export function ChunkyButton({
  children,
  color,
  textColor = "#14112a",
  onClick,
  onPointerDown,
  disabled,
  className = "",
  ariaLabel,
  testId,
}: {
  children: ReactNode;
  color: string;
  textColor?: string;
  onClick?: () => void;
  onPointerDown?: () => void;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
  testId?: string;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
      onPointerDown={onPointerDown}
      className={`group relative select-none rounded-2xl font-display transition-[transform,filter,box-shadow] duration-75 active:translate-y-[5px] disabled:opacity-40 disabled:active:translate-y-0 ${className}`}
      style={{
        background: `linear-gradient(180deg, color-mix(in srgb, ${color} 100%, white 18%) 0%, ${color} 55%, color-mix(in srgb, ${color} 85%, black) 100%)`,
        color: textColor,
        boxShadow: `0 6px 0 color-mix(in srgb, ${color} 55%, black), 0 10px 18px #00000055, inset 0 2px 0 #ffffff55`,
      }}
    >
      {children}
    </button>
  );
}

/** Player row chip with avatar, name and a value. */
export function PlayerChip({
  avatar,
  name,
  value,
  valueTone,
  dim,
  highlight,
}: {
  avatar: ReactNode;
  name?: string;
  value?: ReactNode;
  valueTone?: string;
  dim?: boolean;
  highlight?: boolean;
}) {
  return (
    <li
      className={`flex items-center gap-2 rounded-2xl p-2 transition-opacity ${dim ? "opacity-50" : ""}`}
      style={{
        background: highlight ? "linear-gradient(90deg, #ffc93333, #ffc93311)" : "linear-gradient(90deg, #ffffff10, #ffffff06)",
        boxShadow: highlight ? "inset 0 0 0 2px #ffc933aa" : "inset 0 0 0 1px #ffffff14",
      }}
    >
      {avatar}
      {name !== undefined && <span className="min-w-0 flex-1 truncate font-display">{name}</span>}
      {value !== undefined && (
        <span className="font-display tabular-nums" style={{ color: valueTone ?? "#ffc933" }}>
          {value}
        </span>
      )}
    </li>
  );
}
