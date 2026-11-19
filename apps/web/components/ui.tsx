"use client";
import { AnimatePresence, motion } from "framer-motion";
import { Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { colorHex, type PlayerId, type PublicRoomState } from "@party-game/shared";
import { useStore } from "@/lib/store";
import { photoUrl } from "@/lib/account";
import { isMuted, play, setMuted } from "@/lib/sfx";
import { useRemaining } from "@/lib/time";

/** game-icons.net SVG rendered as a CSS mask so it takes the current text color. */
export function Icon({ id, size = 24, className = "", title }: { id: string; size?: number; className?: string; title?: string }) {
  const url = `url(/icons/${id}.svg)`;
  return (
    <span
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      className={`icon ${className}`}
      style={{ width: size, height: size, maskImage: url, WebkitMaskImage: url }}
    />
  );
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const s = parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2);
  return s.toUpperCase();
}

export interface PlayerLike {
  id: PlayerId;
  name: string;
  color: string;
  /** Optional emoji icon shown instead of initials. */
  avatar?: string | null;
  /** Server path of a custom profile picture (signed-in players). Shown instead of the icon. */
  photo?: string | null;
}

/** Avatar = the player's icon (or initials) in a colored circle. Meaning never by color alone. */
export function Avatar({
  player,
  size = 40,
  ring,
  dim,
  className = "",
}: {
  player: PlayerLike | undefined;
  size?: number;
  ring?: boolean;
  dim?: boolean;
  className?: string;
}) {
  if (!player) return null;
  const hex = colorHex(player.color);
  const photo = photoUrl(player.photo);
  if (photo)
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photo}
        alt={player.name}
        title={player.name}
        width={size}
        height={size}
        className={`shrink-0 rounded-full object-cover ${className}`}
        style={{
          width: size,
          height: size,
          background: hex,
          opacity: dim ? 0.4 : 1,
          // The player's color stays visible as a ring around the photo.
          boxShadow: ring ? `0 0 0 3px #0d0b1a, 0 0 0 6px ${hex}` : `0 0 0 ${Math.max(2, size * 0.06)}px ${hex}`,
        }}
      />
    );
  return (
    <span
      title={player.name}
      className={`inline-flex items-center justify-center rounded-full font-display text-[#14112a] shrink-0 ${className}`}
      style={{
        width: size,
        height: size,
        background: hex,
        fontSize: player.avatar ? size * 0.56 : size * 0.42,
        lineHeight: 1,
        opacity: dim ? 0.4 : 1,
        boxShadow: ring ? `0 0 0 3px #0d0b1a, 0 0 0 6px ${hex}` : `inset 0 -${size * 0.08}px 0 #0003`,
      }}
    >
      {player.avatar || initials(player.name)}
    </span>
  );
}

export function PlayerName({ player, className = "" }: { player: PlayerLike | undefined; className?: string }) {
  if (!player) return null;
  return (
    <span className={`font-display ${className}`} style={{ color: colorHex(player.color) }}>
      {player.name}
    </span>
  );
}

export function usePlayers(): Record<string, PlayerLike & { connected: boolean }> {
  const players = useStore((s) => s.pub?.players);
  const out: Record<string, PlayerLike & { connected: boolean }> = {};
  for (const p of players ?? []) out[p.id] = p;
  return out;
}

export function useMe() {
  const playerId = useStore((s) => s.playerId);
  const players = usePlayers();
  return playerId ? players[playerId] : undefined;
}

/** A number that gives a small pop whenever it changes (not on first render). */
function PopNumber({ value }: { value: number }) {
  const first = useRef(true);
  const prev = useRef(value);
  const changed = !first.current && prev.current !== value;
  const up = value > prev.current;
  useEffect(() => {
    first.current = false;
    prev.current = value;
  }, [value]);
  return (
    <motion.span
      key={value}
      className="inline-block tabular-nums"
      initial={changed ? { scale: 1.45, textShadow: `0 0 12px ${up ? "#2fd27aff" : "#ff4d5eff"}` } : false}
      animate={{ scale: 1, textShadow: `0 0 0px ${up ? "#2fd27a00" : "#ff4d5e00"}` }}
      transition={{ duration: 0.45, ease: "easeOut" }}
    >
      {value}
    </motion.span>
  );
}

export function CoinCount({ value, size = 20, className = "" }: { value: number; size?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 font-display ${className}`}>
      <Icon id="coin" size={size} className="text-accent" />
      <PopNumber value={value} />
    </span>
  );
}

export function StarCount({ value, size = 20, className = "" }: { value: number; size?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 font-display ${className}`}>
      <Icon id="star" size={size} className="text-[#ffe066]" />
      <PopNumber value={value} />
    </span>
  );
}

/** Countdown bar + seconds. Ticks the last 5 seconds. */
export function Timer({ endsAt, totalMs, className = "", silent }: { endsAt: number | null; totalMs?: number; className?: string; silent?: boolean }) {
  const remaining = useRemaining(endsAt, 100);
  const secs = Math.ceil(remaining / 1000);
  const [lastTick, setLastTick] = useState(-1);
  useEffect(() => {
    if (!silent && secs <= 5 && secs > 0 && secs !== lastTick) {
      setLastTick(secs);
      play("tick");
    }
  }, [secs, lastTick, silent]);
  if (!endsAt) return null;
  const pct = totalMs ? Math.max(0, Math.min(1, remaining / totalMs)) : 1;
  const urgent = secs <= 5;
  return (
    <div className={`flex items-center gap-3 ${className}`} role="timer" aria-label={`${secs} seconds left`}>
      <div className="h-3 flex-1 rounded-full bg-bg-2 overflow-hidden">
        <div
          className={`h-full rounded-full transition-[width] duration-100 ease-linear ${urgent ? "bg-bad" : "bg-accent"}`}
          style={{ width: `${pct * 100}%` }}
        />
      </div>
      <span className={`font-display text-xl tabular-nums w-8 text-right ${urgent ? "text-bad" : ""}`}>{secs}</span>
    </div>
  );
}

export function MuteButton({ className = "" }: { className?: string }) {
  const [muted, setM] = useState(false);
  useEffect(() => setM(isMuted()), []);
  return (
    <button
      className={`btn-ghost min-h-11 min-w-9 px-1 sm:min-w-11 sm:px-2 ${className}`}
      aria-label={muted ? "Unmute" : "Mute"}
      onClick={() => {
        setMuted(!muted);
        setM(!muted);
      }}
    >
      {muted ? <VolumeX size={22} /> : <Volume2 size={22} />}
    </button>
  );
}

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div className="fixed top-3 inset-x-0 z-[100] flex flex-col items-center gap-2 pointer-events-none px-4" aria-live="polite">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ y: -30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -30, opacity: 0 }}
            className={`pointer-events-auto rounded-2xl px-4 py-3 font-semibold shadow-xl max-w-md text-center ${
              t.tone === "error" ? "bg-bad text-white" : t.tone === "good" ? "bg-good text-[#06210f]" : "bg-panel-2 text-ink"
            }`}
            onClick={() => useStore.getState().dismiss(t.id)}
          >
            {t.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export function ConnectionBadge() {
  const connected = useStore((s) => s.connected);
  if (connected) return null;
  return (
    <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-[90] rounded-full bg-bad px-4 py-2 font-semibold text-white shadow-xl">
      Reconnecting…
    </div>
  );
}

export function ThemeBadge({ theme }: { theme: { name: string; icon: string; color: string } | undefined }) {
  if (!theme) return null;
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full px-3 py-1 font-display text-sm text-[#14112a]"
      style={{ background: theme.color }}
    >
      <Icon id={theme.icon} size={16} />
      {theme.name}
    </span>
  );
}

export function useIsHost(): boolean {
  const pub = useStore((s) => s.pub);
  const role = useStore((s) => s.role);
  const playerId = useStore((s) => s.playerId);
  if (role === "display") return true;
  return !!pub && !!playerId && pub.hostId === playerId;
}

export type { PublicRoomState };
