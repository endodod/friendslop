"use client";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, Clock, Eye, Shuffle, Users } from "lucide-react";
import { useState } from "react";
import { GAMES, PLAY_MODES, TEAM_INFO, type GameId, type GameInfo, type PlayMode, type TeamId } from "@party-game/shared";
import { useStore } from "@/lib/store";
import { act } from "@/lib/useRoom";
import { Avatar, Icon, useIsHost, useMe } from "../ui";

const MODE_STYLE: Record<PlayMode, string> = {
  ffa: "bg-bg-2/80 text-muted",
  teams: "bg-[#ff8a3d]/20 text-[#ffb27a]",
  coop: "bg-good/20 text-good",
};

/** "Co-op" / "Teams" / "Free-for-all" chip on game cards. */
export function ModeChip({ mode, className = "" }: { mode: PlayMode; className?: string }) {
  const m = PLAY_MODES[mode];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${MODE_STYLE[mode]} ${className}`}
      title={m.short}
      data-testid={`mode-${mode}`}
    >
      <Icon id={m.icon} size={12} /> {m.label}
    </span>
  );
}

export function GameCard({
  info,
  selected,
  onSelect,
  disabled,
  playerCount,
  compact,
}: {
  info: GameInfo;
  selected: boolean;
  onSelect?: () => void;
  disabled?: boolean;
  playerCount?: number;
  compact?: boolean;
}) {
  const fits = playerCount === undefined || (playerCount >= info.players.min && playerCount <= info.players.max);
  return (
    <motion.button
      type="button"
      whileTap={onSelect && !disabled ? { scale: 0.97 } : undefined}
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      data-testid={`game-${info.id}`}
      className={`relative flex h-full min-w-0 flex-col gap-2 overflow-hidden rounded-3xl border-2 p-4 text-left transition-[transform,border-color] ${
        selected ? "" : "border-line"
      } ${onSelect && !disabled ? "cursor-pointer hover:-translate-y-0.5" : "cursor-default"} disabled:opacity-100`}
      style={{
        borderColor: selected ? info.color : undefined,
        background: `linear-gradient(160deg, ${info.color}${selected ? "40" : "1c"}, var(--color-panel) 70%)`,
      }}
    >
      <div className="flex items-center gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-[#14112a] shadow-[0_4px_0_#0004]" style={{ background: info.color }}>
          <Icon id={info.icon} size={30} />
        </span>
        <div className="flex min-w-0 flex-col">
          <span className="font-display text-2xl leading-tight">{info.name}</span>
          <span className="flex flex-wrap items-center gap-x-3 text-xs text-muted">
            <span className={`flex items-center gap-1 ${fits ? "" : "font-semibold text-bad"}`}>
              <Users size={12} /> {info.players.min}–{info.players.max}
            </span>
            <span className="flex items-center gap-1">
              <Clock size={12} /> {info.minutes}
            </span>
            <ModeChip mode={info.mode} className="-ml-1" />
          </span>
        </div>
        {selected && (
          <span className="ml-auto rounded-full p-1 text-[#14112a]" style={{ background: info.color }}>
            <Check size={16} strokeWidth={3} />
          </span>
        )}
      </div>
      {/* Two lines reserved so every card's tags sit on the same line. */}
      <p className="line-clamp-2 min-h-[2lh] text-sm leading-snug text-ink/90">{info.tagline}</p>
      {!compact && (
        <div className="mt-auto flex flex-wrap gap-1.5">
          {info.tags.filter((t) => t !== PLAY_MODES[info.mode].label).map((t) => (
            <span key={t} className="rounded-full bg-bg-2/80 px-2 py-0.5 text-xs text-muted">
              {t}
            </span>
          ))}
        </div>
      )}
    </motion.button>
  );
}

/** Lobby: which game this room plays. The host switches; everyone sees it. Collapsed to the current game. */
export function GamePicker() {
  const pub = useStore((s) => s.pub!);
  const isHost = useIsHost();
  const [open, setOpen] = useState(false);
  const current = pub.settings.gameId ?? "party";
  const info = GAMES.find((g) => g.id === current) ?? GAMES[0];
  const others = GAMES.filter((g) => g.id !== current);
  const n = pub.players.length;
  const fitting = others.filter((g) => n >= g.players.min && n <= g.players.max).length;
  return (
    <section className="card flex flex-col gap-3 p-5" data-testid="game-picker">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-2xl">
          Game {!isHost && <span className="text-sm text-muted">(host decides)</span>}
        </h2>
        <button
          className="btn-ghost min-h-11 text-sm"
          aria-expanded={open}
          aria-controls="game-list"
          onClick={() => setOpen((o) => !o)}
          data-testid="game-picker-toggle"
        >
          {open ? "Hide games" : isHost ? `Change game (${GAMES.length})` : `All games (${GAMES.length})`}
          <motion.span animate={{ rotate: open ? 180 : 0 }} className="flex">
            <ChevronDown size={18} />
          </motion.span>
        </button>
      </div>
      <GameCard info={info} compact selected playerCount={n} disabled />
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id="game-list"
            key="list"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <p className="pb-2 text-sm text-muted">
              {fitting} of {others.length} other games fit {n} player{n === 1 ? "" : "s"}.
            </p>
            <div className="grid gap-3 pb-1 sm:grid-cols-2">
              {others.map((g) => (
                <GameCard
                  key={g.id}
                  info={g}
                  compact
                  selected={false}
                  playerCount={n}
                  disabled={!isHost}
                  onSelect={
                    isHost
                      ? () => {
                          setOpen(false);
                          void act("room:settings", { gameId: g.id as GameId });
                        }
                      : undefined
                  }
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

/** Spy Grid lobby: pick a team, volunteer as clue-giver; the host can shuffle. */
export function TeamsPanel() {
  const pub = useStore((s) => s.pub!);
  const me = useMe();
  const isHost = useIsHost();
  const meRoom = pub.players.find((p) => p.id === me?.id);
  const byTeam = (t: TeamId | null) => pub.players.filter((p) => (p.team ?? null) === t);
  const any = byTeam(null);
  return (
    <section className="card flex flex-col gap-3 p-5" data-testid="teams-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-2xl">Teams</h2>
        {isHost && (
          <button className="btn-secondary min-h-11 text-base" onClick={() => act("room:shuffleTeams", {})}>
            <Shuffle size={18} /> Shuffle teams
          </button>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {(["a", "b"] as const).map((t) => {
          const info = TEAM_INFO[t];
          const members = byTeam(t);
          const mine = meRoom?.team === t;
          const giverTaken = members.some((p) => p.clueGiver && p.id !== meRoom?.id);
          return (
            <div
              key={t}
              className="flex flex-col gap-2 rounded-2xl p-3"
              style={{ background: `${info.color}1f`, boxShadow: `inset 0 0 0 2px ${info.color}${mine ? "" : "55"}` }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-display text-xl" style={{ color: info.color }}>
                  {info.emoji} {info.name} <span className="text-sm text-muted">{members.length}</span>
                </span>
                {meRoom && !mine && (
                  <button className="btn-secondary min-h-11 px-3 text-base" onClick={() => act("room:team", { team: t })} data-testid={`join-team-${t}`}>
                    Join
                  </button>
                )}
              </div>
              <ul className="flex min-h-10 flex-wrap gap-2">
                {members.map((p) => (
                  <li key={p.id} className="flex items-center gap-1.5 rounded-full bg-bg-2 py-0.5 pl-0.5 pr-2.5">
                    <Avatar player={p} size={26} />
                    <span className="font-display text-sm">{p.name}</span>
                    {p.clueGiver && <Eye size={14} className="text-accent" aria-label="wants to give clues" />}
                  </li>
                ))}
                {members.length === 0 && <li className="text-sm text-muted">Nobody yet</li>}
              </ul>
              {mine && (
                <label className={`flex min-h-11 items-center gap-2 text-sm ${giverTaken ? "opacity-50" : "cursor-pointer"}`}>
                  <input
                    type="checkbox"
                    className="h-5 w-5 accent-[var(--color-accent)]"
                    checked={!!meRoom?.clueGiver}
                    disabled={giverTaken}
                    onChange={(e) => act("room:team", { clueGiver: e.target.checked })}
                  />
                  I want to give the clues {giverTaken && "(taken)"}
                </label>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
        <span>Any team (balanced at start):</span>
        {any.map((p) => (
          <Avatar key={p.id} player={p} size={24} />
        ))}
        {any.length === 0 && <span>–</span>}
        {meRoom?.team && (
          <button className="btn-ghost min-h-11 px-2 text-sm" onClick={() => act("room:team", { team: null })}>
            Any team is fine
          </button>
        )}
      </div>
      <p className="text-xs text-muted">No clue-giver picked? One is chosen at random, and the role rotates when you play again.</p>
    </section>
  );
}
