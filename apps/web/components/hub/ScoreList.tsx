"use client";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import type { BluffPublic, OddPublic, SpectrumPublic, WhoPublic } from "@party-game/shared";
import { Avatar, PlayerName, usePlayers } from "../ui";
import { useHub } from "./common";

/** Who still has to act in the current phase (for the ✓ marks). */
function useDone(): { done: Set<string>; busy: Set<string> } {
  const hub = useHub();
  if (hub.gameId === "spectrum") {
    const s = hub.state as SpectrumPublic;
    const r = s.round;
    if (!r) return { done: new Set(), busy: new Set() };
    if (s.phase === "clue") return { done: new Set(), busy: new Set([r.giverId]) };
    if (s.phase === "guess") return { done: new Set(r.locked), busy: new Set(s.players.filter((p) => p !== r.giverId && !r.locked.includes(p))) };
  }
  if (hub.gameId === "bluff") {
    const s = hub.state as BluffPublic;
    const r = s.round;
    if (!r) return { done: new Set(), busy: new Set() };
    if (s.phase === "write") return { done: new Set(r.written), busy: new Set(s.players.filter((p) => !r.written.includes(p))) };
    if (s.phase === "vote") {
      const voters = s.players.filter((p) => p !== r.targetId && !r.mindReaders.includes(p));
      return { done: new Set(r.voted), busy: new Set(voters.filter((p) => !r.voted.includes(p))) };
    }
  }
  if (hub.gameId === "whowrote") {
    const s = hub.state as WhoPublic;
    const r = s.round;
    if (!r) return { done: new Set(), busy: new Set() };
    if (s.phase === "write") return { done: new Set(r.written), busy: new Set(s.players.filter((p) => !r.written.includes(p))) };
    // Who is guessing (the author isn't known yet, so nobody is marked busy).
    if (s.phase === "guess" && r.current) return { done: new Set(r.current.guessed), busy: new Set() };
  }
  if (hub.gameId === "oddword") {
    const s = hub.state as OddPublic;
    const r = s.round;
    if (r && s.phase === "clue" && r.turnPlayerId) return { done: new Set(), busy: new Set([r.turnPlayerId]) };
    if (r && s.phase === "vote") return { done: new Set(r.voted), busy: new Set(s.players.filter((p) => !r.voted.includes(p))) };
  }
  return { done: new Set(), busy: new Set() };
}

/** Standings for the free-for-all hub games. */
export function ScoreList() {
  const hub = useHub();
  const players = usePlayers();
  const s = hub.state as { scores: Record<string, number>; players: string[]; round: { points: Record<string, number> | null } | null; phase: string };
  const { done, busy } = useDone();
  const order = [...s.players].sort((a, b) => (s.scores[b] ?? 0) - (s.scores[a] ?? 0));
  const who = hub.gameId === "whowrote" ? (hub.state as WhoPublic) : null;
  const gained =
    s.phase === "reveal" || (hub.gameId === "oddword" && s.phase === "result")
      ? (s.round?.points ?? null)
      : who && who.phase === "result"
        ? (who.round?.revealed[who.round.revealed.length - 1]?.points ?? null)
        : null;
  return (
    <div className="flex flex-col gap-2" data-testid="hub-scores">
      <h3 className="font-display text-xl text-muted">Scores</h3>
      <ol className="flex flex-col gap-1.5">
        {order.map((pid, i) => {
          const p = players[pid];
          const plus = gained?.[pid] ?? 0;
          return (
            <motion.li layout key={pid} className="flex items-center gap-2 rounded-2xl bg-bg-2 px-2 py-1.5">
              <span className="w-5 text-center font-display text-muted">{i + 1}</span>
              <span className="relative">
                <Avatar player={p} size={30} dim={!p?.connected} />
                {done.has(pid) && (
                  <span className="absolute -bottom-1 -right-1 rounded-full bg-good p-0.5 text-[#06210f]" aria-label="done">
                    <Check size={10} strokeWidth={4} />
                  </span>
                )}
              </span>
              <PlayerName player={p} className="min-w-0 flex-1 truncate" />
              {busy.has(pid) && <span className="text-xs text-muted animate-pulse">…</span>}
              {plus > 0 && (
                <motion.span initial={{ scale: 1.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="font-display text-good">
                  +{plus}
                </motion.span>
              )}
              <span className="w-10 text-right font-display text-xl tabular-nums">{s.scores[pid] ?? 0}</span>
            </motion.li>
          );
        })}
      </ol>
    </div>
  );
}
