"use client";
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

/** Re-render on every animation frame while `active`. Returns the server-synced time. */
export function useFrameNow(now: () => number, active = true): number {
  const [t, setT] = useState(now);
  useEffect(() => {
    if (!active) return;
    let id = 0;
    const loop = () => {
      setT(now());
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [now, active]);
  return t;
}

/** Big press-and-hold button that works with touch, mouse and keyboard (space). */
export function HoldButton({
  onChange,
  disabled,
  label,
  holdingLabel,
  color = "#ffc933",
}: {
  onChange: (holding: boolean) => void;
  disabled?: boolean;
  label: string;
  holdingLabel?: string;
  color?: string;
}) {
  const [holding, setHolding] = useState(false);
  const ref = useRef(false);
  const set = (h: boolean) => {
    if (disabled && h) return;
    if (ref.current === h) return;
    ref.current = h;
    setHolding(h);
    onChange(h);
  };
  useEffect(() => {
    const down = (e: KeyboardEvent) => e.code === "Space" && !e.repeat && (e.preventDefault(), set(true));
    const up = (e: KeyboardEvent) => e.code === "Space" && (e.preventDefault(), set(false));
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled]);
  useEffect(() => {
    if (disabled && ref.current) set(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled]);
  return (
    <button
      type="button"
      disabled={disabled}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture?.(e.pointerId);
        set(true);
      }}
      onPointerUp={() => set(false)}
      onPointerCancel={() => set(false)}
      onContextMenu={(e) => e.preventDefault()}
      className="relative min-h-28 w-full touch-none select-none overflow-hidden rounded-3xl font-display text-3xl text-[#14112a] transition-[transform,box-shadow] duration-75 disabled:opacity-40"
      style={{
        background: `linear-gradient(180deg, color-mix(in srgb, ${color} 100%, white 22%) 0%, ${color} 55%, color-mix(in srgb, ${color} 82%, black) 100%)`,
        transform: holding ? "translateY(6px) scale(0.985)" : undefined,
        boxShadow: holding
          ? `0 2px 0 color-mix(in srgb, ${color} 50%, black), 0 0 34px ${color}aa, inset 0 2px 0 #fff6`
          : `0 8px 0 color-mix(in srgb, ${color} 50%, black), 0 12px 22px #0007, inset 0 2px 0 #fff6`,
        WebkitUserSelect: "none",
        WebkitTouchCallout: "none",
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-6 top-2 h-1/3 rounded-full bg-white/25 blur-[1px]"
      />
      <span className="relative">{holding ? (holdingLabel ?? "Holding…") : label}</span>
    </button>
  );
}

export function SubmittedNotice({ label }: { label: string }) {
  return (
    <motion.div
      initial={{ scale: 0.85, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 260, damping: 18 }}
      className="relative overflow-hidden rounded-[28px] p-6 text-center"
      style={{
        background: "radial-gradient(120% 100% at 50% 0%, #2fd27a40 0%, transparent 65%), linear-gradient(180deg, #1d1838, #120f24)",
        boxShadow: "inset 0 0 0 2px #2fd27a66, 0 10px 30px #0006",
      }}
    >
      <motion.span
        aria-hidden
        className="pointer-events-none absolute -inset-10 opacity-30"
        style={{ background: "conic-gradient(from 0deg, transparent 0 20deg, #2fd27a55 20deg 30deg, transparent 30deg 60deg, #ffc93344 60deg 70deg, transparent 70deg 120deg)" }}
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 18, ease: "linear" }}
      />
      <p className="relative font-display text-4xl text-good drop-shadow-[0_3px_0_#0007]">Done!</p>
      <p className="relative mt-1 font-display text-3xl text-ink">{label}</p>
      <p className="relative mt-2 flex items-center justify-center gap-1.5 text-muted">
        <span className="inline-flex gap-1" aria-hidden>
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="h-1.5 w-1.5 rounded-full bg-muted"
              animate={{ y: [0, -4, 0] }}
              transition={{ repeat: Infinity, duration: 0.9, delay: i * 0.15 }}
            />
          ))}
        </span>
        Waiting for the others
      </p>
    </motion.div>
  );
}

/** Live list of who finished (solo games). */
export function SoloStatus({
  participants,
  submitted,
  labels,
  players,
  Avatar,
}: {
  participants: string[];
  submitted: string[];
  labels: Record<string, string>;
  players: Record<string, { id: string; name: string; color: string }>;
  Avatar: React.ComponentType<{ player: any; size?: number; dim?: boolean }>;
}) {
  return (
    <ul className="grid grid-cols-2 gap-2">
      {participants.map((pid) => {
        const done = submitted.includes(pid);
        return (
          <motion.li
            key={pid}
            layout
            className="flex items-center gap-2 rounded-2xl p-2"
            style={{
              background: done ? "linear-gradient(90deg, #2fd27a26, #ffffff08)" : "linear-gradient(90deg, #ffffff10, #ffffff05)",
              boxShadow: done ? "inset 0 0 0 1.5px #2fd27a77" : "inset 0 0 0 1px #ffffff14",
            }}
          >
            <Avatar player={players[pid]} size={32} dim={!done} />
            <span className="flex-1 truncate font-display">{players[pid]?.name}</span>
            {done ? (
              <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="font-display text-accent">
                {labels[pid]}
              </motion.span>
            ) : (
              <span className="text-xs text-muted">playing…</span>
            )}
          </motion.li>
        );
      })}
    </ul>
  );
}

/** True when the user is typing in a field (then Space must type, not trigger the game). */
function typing(e: KeyboardEvent) {
  const el = e.target as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
}

/**
 * Keyboard shortcut for desktop players (Space by default). Ignores auto-repeat and typing in fields.
 * The handler is read from a ref, so it always sees fresh state.
 */
export function useKey(handler: (e: KeyboardEvent) => void, opts: { keys?: string[]; enabled?: boolean } = {}) {
  const ref = useRef(handler);
  ref.current = handler;
  const keys = (opts.keys ?? ["Space"]).join(",");
  const enabled = opts.enabled ?? true;
  useEffect(() => {
    if (!enabled) return;
    const list = keys.split(",");
    const down = (e: KeyboardEvent) => {
      if (e.repeat || typing(e) || !list.includes(e.code)) return;
      e.preventDefault();
      ref.current(e);
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [keys, enabled]);
}

/** Small "or press Space" hint, only on devices with a fine pointer (mouse). */
export function KeyHint({ label = "Space", text = "or press" }: { label?: string; text?: string }) {
  return (
    <span className="hidden text-sm text-muted [@media(pointer:fine)]:inline">
      {text}{" "}
      <kbd className="rounded-md border border-line bg-bg-2 px-1.5 py-0.5 font-sans text-xs text-ink">{label}</kbd>
    </span>
  );
}
