"use client";
import { motion } from "framer-motion";
import { Check, Clock, Eye, Shuffle, Users } from "lucide-react";
import { GAMES, TEAM_INFO, type GameId, type GameInfo, type TeamId } from "@party-game/shared";
import { useStore } from "@/lib/store";
import { act } from "@/lib/useRoom";
import { Avatar, Icon, useIsHost, useMe } from "../ui";

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
      className={`relative flex min-w-0 flex-col gap-2 overflow-hidden rounded-3xl border-2 p-4 text-left transition-[transform,border-color] ${
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
          </span>
        </div>
        {selected && (
          <span className="ml-auto rounded-full p-1 text-[#14112a]" style={{ background: info.color }}>
            <Check size={16} strokeWidth={3} />
          </span>
        )}
      </div>
      <p className="text-sm leading-snug text-ink/90">{info.tagline}</p>
      {!compact && (
        <div className="flex flex-wrap gap-1.5">
          {info.tags.map((t) => (
            <span key={t} className="rounded-full bg-bg-2/80 px-2 py-0.5 text-xs text-muted">
              {t}
            </span>
          ))}
        </div>
      )}
    </motion.button>
  );
}

/** Lobby: which game this room plays. The host switches; everyone sees it. */
export function GamePicker() {
  const pub = useStore((s) => s.pub!);
  const isHost = useIsHost();
  const current = pub.settings.gameId ?? "party";
  return (
    <section className="card flex flex-col gap-3 p-5" data-testid="game-picker">
      <h2 className="font-display text-2xl">
        Game {!isHost && <span className="text-sm text-muted">(host decides)</span>}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {GAMES.map((g) => (
          <GameCard
            key={g.id}
            info={g}
            compact
            selected={g.id === current}
            playerCount={pub.players.length}
            disabled={!isHost}
            onSelect={isHost && g.id !== current ? () => act("room:settings", { gameId: g.id as GameId }) : undefined}
          />
        ))}
      </div>
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
