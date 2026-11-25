"use client";
import { AnimatePresence, motion } from "framer-motion";
import { Check, CircleHelp, FastForward, X } from "lucide-react";
import { useState } from "react";
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
