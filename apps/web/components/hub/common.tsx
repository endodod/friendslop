"use client";
import { AnimatePresence, motion } from "framer-motion";
import { Check, CircleHelp, FastForward, X } from "lucide-react";
import { useEffect, useState } from "react";
import { TEAM_INFO, gameInfo, type GameInfo, type HubGameId, type PublicHub, type TeamId } from "@party-game/shared";
import { useStore } from "@/lib/store";
import { act } from "@/lib/useRoom";
import { Avatar, Icon, Timer, useIsHost, usePlayers } from "../ui";

export function useHub(): PublicHub {
  return useStore((s) => s.pub!.hub!);
}
export function useHubState<T>(): T {
  return useStore((s) => s.pub!.hub!.state) as T;
}
export function useHubPriv<T>(): T | null {
  return useStore((s) => (s.priv?.hub ?? null) as T | null);
}

/** Send a move in the current hub game. */
export function hubAct(action: unknown) {
  return act("hub:action", { action });
}

/** Host-only "skip" (reveal screens, turn ends). */
export function HubSkip({ label = "Skip" }: { label?: string }) {
  const isHost = useIsHost();
  if (!isHost) return null;
  return (
    <button className="btn-ghost min-h-11 self-end text-sm" onClick={() => act("game:continue", {})} data-testid="hub-skip">
      <FastForward size={16} /> {label}
    </button>
  );
}

export function GameBadge({ info, size = "md" }: { info: GameInfo; size?: "sm" | "md" }) {
  return (
    <span
      className={`inline-flex min-w-0 items-center gap-2 rounded-xl font-display text-[#14112a] ${size === "sm" ? "px-2 py-1 text-sm" : "px-3 py-1"}`}
      style={{ background: info.color }}
    >
      <Icon id={info.icon} size={size === "sm" ? 16 : 20} />
      <span className="truncate">{info.name}</span>
    </span>
  );
}

export function TeamChip({ team, className = "", children }: { team: TeamId; className?: string; children?: React.ReactNode }) {
  const t = TEAM_INFO[team];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-3 py-0.5 font-display text-[#14112a] ${className}`}
      style={{ background: t.color }}
    >
      <span aria-hidden>{t.emoji}</span> {children ?? t.name}
    </span>
  );
}

/** The game's tutorial steps (intro screen and help sheet). */
export function HubRules({ id }: { id: HubGameId }) {
  const info = gameInfo(id);
  return (
    <div className="flex flex-col gap-3">
      <p className="leading-snug text-muted">{info.description}</p>
      <ol className="flex flex-col gap-2">
        {info.howTo.map((s, i) => (
          <motion.li
            key={s.title}
            initial={{ x: -16, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.15 + i * 0.12 }}
            className="flex items-start gap-3 rounded-2xl bg-bg-2 p-3"
          >
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[#14112a]"
              style={{ background: info.color }}
            >
              <Icon id={s.icon} size={24} />
            </span>
            <span className="flex flex-col">
              <span className="font-display text-lg leading-tight">{s.title}</span>
              <span className="text-sm leading-snug text-muted">{s.text}</span>
            </span>
          </motion.li>
        ))}
      </ol>
    </div>
  );
}

/** How-to-play screen before the first round; ends when everyone tapped "Got it!". */
export function HubIntro({ extra }: { extra?: React.ReactNode }) {
  const hub = useHub();
  const info = gameInfo(hub.gameId);
  return (
    <div className="flex flex-col gap-4" data-testid="hub-intro">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-4xl" style={{ color: info.color }}>
          How to play
        </h2>
        <GameBadge info={info} />
      </div>
      <HubRules id={hub.gameId as HubGameId} />
      {extra}
      <IntroTimer />
      <HubReady />
      <HubSkip />
    </div>
  );
}

function IntroTimer() {
  const hub = useHub();
  // Reuses the shared countdown bar.
  return <Timer endsAt={hub.stageEndsAt} totalMs={hub.stageEndsAt ? hub.stageEndsAt - hub.stageStartedAt : 0} silent />;
}

/** ReadyUp reads pub.game.ready; hub games keep their own list. */
function HubReady() {
  const hub = useHub();
  return <ReadyUpFor who={hub.players} ready={hub.ready} />;
}


function ReadyUpFor({ who, ready }: { who: string[]; ready: string[] }) {
  const playerId = useStore((s) => s.playerId);
  const players = usePlayers();
  const meIn = !!playerId && who.includes(playerId);
  const iAmReady = !!playerId && ready.includes(playerId);
  return (
    <div className="flex flex-col items-center gap-3">
      {meIn && (
        <button
          className={iAmReady ? "btn-secondary min-h-14 w-full" : "btn-primary min-h-14 w-full text-2xl"}
          disabled={iAmReady}
          onClick={() => act("game:ready", {})}
          data-testid="got-it"
        >
          {iAmReady ? (
            <>
              <Check /> Waiting for the others…
            </>
          ) : (
            "Got it!"
          )}
        </button>
      )}
      <div className="flex flex-wrap justify-center gap-2" aria-label="Ready">
        {who.map((pid) => (
          <span key={pid} className="relative">
            <Avatar player={players[pid]} size={34} dim={!ready.includes(pid)} />
            {ready.includes(pid) && (
              <span className="absolute -bottom-1 -right-1 rounded-full bg-good p-0.5 text-[#06210f]">
                <Check size={10} strokeWidth={4} />
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

/** "?" in the top bar: the rules of the current hub game. */
export function HubHelpButton({ id }: { id: HubGameId }) {
  const [open, setOpen] = useState(false);
  const info = gameInfo(id);
  return (
    <>
      <button className="btn-ghost min-h-11 min-w-9 px-1 sm:min-w-11 sm:px-2" aria-label="How to play" onClick={() => setOpen(true)}>
        <CircleHelp size={22} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[90] flex items-end justify-center bg-black/60 p-3 sm:items-center"
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ y: 40 }}
              animate={{ y: 0 }}
              className="card flex max-h-[85dvh] w-full max-w-2xl flex-col gap-3 overflow-y-auto p-5"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-label="How to play"
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display text-3xl">How to play {info.name}</h2>
                <button className="btn-ghost min-h-11 min-w-9 px-1 sm:min-w-11 sm:px-2" aria-label="Close" onClick={() => setOpen(false)}>
                  <X />
                </button>
              </div>
              <HubRules id={id} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/** A big, short-lived headline (round starts, reveals). */
export function Banner({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <motion.div
      initial={{ scale: 0.6, opacity: 0, rotate: -4 }}
      animate={{ scale: 1, opacity: 1, rotate: 0 }}
      transition={{ type: "spring", stiffness: 160, damping: 14 }}
      className="text-center font-display text-4xl sm:text-5xl"
      style={{ color }}
    >
      {children}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Board-quality building blocks (same look as the Party Board)
// ---------------------------------------------------------------------------

/** Darken a #rrggbb color (for the chunky bottom edge of 3D buttons). */
export function shade(hex: string, f = 0.6): string {
  const n = (i: number) => Math.round(parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) * f).toString(16).padStart(2, "0");
  return `#${n(0)}${n(1)}${n(2)}`;
}

/** Chunky 3D surface: glossy top, dark bottom edge. Spread into `style`. */
export function chunky(color: string, { pressed = false, depth = 5 } = {}) {
  return {
    background: `linear-gradient(180deg, #ffffff38 0%, #ffffff00 45%), ${color}`,
    boxShadow: pressed ? `0 1px 0 ${shade(color)}` : `0 ${depth}px 0 ${shade(color)}, 0 ${depth + 4}px 14px #0006`,
    transform: pressed ? `translateY(${depth - 1}px)` : undefined,
  };
}

/** The board-like frame every hub game is played in: glow in the game's color, starry dots, drifting light. */
export function Stage({ color, header, children, className = "" }: { color: string; header?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`relative overflow-hidden rounded-[28px] ${className}`}
      style={{
        background: `radial-gradient(120% 90% at 50% 0%, ${color}30 0%, transparent 60%), radial-gradient(80% 60% at 50% 110%, ${color}1c 0%, transparent 70%), radial-gradient(#ffffff10 1.2px, transparent 1.3px) 0 0 / 22px 22px, linear-gradient(180deg, #1d1838 0%, #120f24 100%)`,
        boxShadow: `inset 0 0 0 2px ${color}55, inset 0 -18px 40px #00000055, 0 10px 30px #00000066`,
      }}
      data-testid="stage"
    >
      <div
        aria-hidden
        className="anim-drift pointer-events-none absolute -inset-[20%]"
        style={{ background: `radial-gradient(35% 30% at 30% 35%, ${color}22, transparent 70%), radial-gradient(30% 25% at 72% 70%, #ff6bc61a, transparent 70%)` }}
      />
      {header && <div className="relative z-10 px-2 pt-2 sm:px-3 sm:pt-3">{header}</div>}
      <div className="relative z-10 p-3 sm:p-5">{children}</div>
    </div>
  );
}

export interface StripItem {
  pid: string;
  /** Shown after the name (score, "clues"…). */
  right?: React.ReactNode;
  active?: boolean;
  done?: boolean;
  /** Ring color (team) instead of the player's color. */
  tint?: string;
}

/** Player chips along the top of the stage, like the board's score strip. */
export function PlayerStrip({ items }: { items: StripItem[] }) {
  const players = usePlayers();
  return (
    <ul className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]" aria-label="Players">
      {items.map((it) => {
        const p = players[it.pid];
        const ring = it.tint;
        return (
          <motion.li
            layout
            key={it.pid}
            className={`flex shrink-0 items-center gap-1.5 rounded-xl bg-bg/70 py-1 pl-1 pr-2.5 font-display text-sm backdrop-blur ${it.active ? "anim-float" : ""}`}
            style={{ boxShadow: it.active ? `inset 0 0 0 2px ${ring ?? "#ffc933"}` : ring ? `inset 0 0 0 1.5px ${ring}88` : undefined }}
          >
            <span className="relative">
              <Avatar player={p} size={24} dim={!p?.connected} />
              {it.done && (
                <span className="absolute -bottom-1 -right-1 rounded-full bg-good p-0.5 text-[#06210f]">
                  <Check size={8} strokeWidth={4} />
                </span>
              )}
            </span>
            <span className="max-w-24 truncate">{p?.name}</span>
            {it.right !== undefined && <span className="tabular-nums text-accent">{it.right}</span>}
          </motion.li>
        );
      })}
    </ul>
  );
}

/** A big headline that springs in over the stage when `id` changes, then gets out of the way. */
export function Splash({ id, children, color = "#ffc933", sub }: { id: string; children: React.ReactNode; color?: string; sub?: React.ReactNode }) {
  const [shown, setShown] = useState<string | null>(id);
  useEffect(() => {
    setShown(id);
    const t = setTimeout(() => setShown(null), 1500);
    return () => clearTimeout(t);
  }, [id]);
  return (
    <AnimatePresence>
      {shown === id && (
        <motion.div
          key={id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center gap-2 bg-bg/40 backdrop-blur-[2px]"
          aria-hidden
        >
          <motion.div
            initial={{ scale: 2.4, rotate: -8, opacity: 0 }}
            animate={{ scale: 1, rotate: -2, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ type: "spring", stiffness: 160, damping: 13 }}
            className="rounded-3xl px-6 py-3 text-center font-display text-4xl text-[#14112a] sm:text-6xl"
            style={chunky(color, { depth: 8 })}
          >
            {children}
          </motion.div>
          {sub && (
            <motion.p initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.25 }} className="font-display text-xl drop-shadow-[0_2px_0_#000a] sm:text-2xl">
              {sub}
            </motion.p>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
