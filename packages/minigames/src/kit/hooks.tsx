"use client";
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
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        set(true);
      }}
      onPointerUp={() => set(false)}
      onPointerCancel={() => set(false)}
      onContextMenu={(e) => e.preventDefault()}
      className="min-h-28 w-full touch-none select-none rounded-3xl font-display text-3xl text-[#14112a] transition-transform disabled:opacity-40"
      style={{
        background: color,
        transform: holding ? "translateY(6px) scale(0.98)" : undefined,
        boxShadow: holding ? "0 2px 0 #0006" : "0 8px 0 #0006",
        WebkitUserSelect: "none",
        WebkitTouchCallout: "none",
      }}
    >
      {holding ? (holdingLabel ?? "Holding…") : label}
    </button>
  );
}

export function SubmittedNotice({ label }: { label: string }) {
  return (
    <div className="rounded-3xl bg-bg-2 p-6 text-center">
      <p className="font-display text-3xl text-good">Done!</p>
      <p className="mt-1 text-xl">{label}</p>
      <p className="mt-2 text-muted">Waiting for the others…</p>
    </div>
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
      {participants.map((pid) => (
        <li key={pid} className="flex items-center gap-2 rounded-2xl bg-bg-2 p-2">
          <Avatar player={players[pid]} size={32} dim={!submitted.includes(pid)} />
          <span className="flex-1 truncate font-display">{players[pid]?.name}</span>
          <span className="font-display text-accent">{submitted.includes(pid) ? labels[pid] : "…"}</span>
        </li>
      ))}
    </ul>
  );
}
