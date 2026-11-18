import { z } from "zod";
import { rankByScore, type MiniGameDefinition, type PlayerId } from "@party-game/shared";

export const ROUNDS = 3;
export const PICK_MS = 10000;
export const REVEAL_MS = 4000;

/** Numbers on offer: a few more than players so there's room to hide. */
export const maxNumber = (players: number) => Math.min(10, players + 3);

export interface LoneWolfState {
  players: PlayerId[];
  bonuses: PlayerId[];
  round: number;
  phase: "pick" | "reveal" | "done";
  phaseEndsAt: number;
  /** picks[round][player] */
  picks: Record<PlayerId, number>[];
  winners: (PlayerId | null)[];
  points: Record<PlayerId, number>;
}

/** The player with the lowest number nobody else picked, or null. */
export function loneWolf(picks: Record<PlayerId, number>): PlayerId | null {
  const counts = new Map<number, PlayerId[]>();
  for (const [pid, n] of Object.entries(picks)) counts.set(n, [...(counts.get(n) ?? []), pid]);
  const unique = [...counts.entries()].filter(([, ps]) => ps.length === 1).sort((a, b) => a[0] - b[0]);
  return unique[0]?.[1][0] ?? null;
}

function finishRound(s: LoneWolfState, now: number): LoneWolfState {
  const picks = s.picks[s.round] ?? {};
  const w = loneWolf(picks);
  const points = { ...s.points };
  if (w) points[w] += s.bonuses.includes(w) ? 2 : 1;
  const winners = [...s.winners];
  winners[s.round] = w;
  return { ...s, phase: "reveal", phaseEndsAt: now + REVEAL_MS, winners, points };
}

export const loneWolfGame: MiniGameDefinition<LoneWolfState, { pick: number }> = {
  id: "lone-wolf",
  kind: "sharedRealtime",
  durationSec: ROUNDS * ((PICK_MS + REVEAL_MS) / 1000) + 6,
  minPlayers: 3,
  inputSchema: z.object({ pick: z.number().int().min(1).max(10) }),
  init: ({ players, bonuses, now }) => ({
    players,
    bonuses,
    round: 0,
    phase: "pick",
    phaseEndsAt: now + PICK_MS,
    picks: [{}],
    winners: [],
    points: Object.fromEntries(players.map((p) => [p, 0])),
  }),
  onInput: (s, pid, { pick }, { now }) => {
    if (s.phase !== "pick" || s.picks[s.round][pid] !== undefined || pick > maxNumber(s.players.length)) return s;
    const picks = [...s.picks];
    picks[s.round] = { ...picks[s.round], [pid]: pick };
    const next = { ...s, picks };
    return s.players.every((p) => picks[s.round][p] !== undefined) ? finishRound(next, now) : next;
  },
  tick: (s, { now }) => {
    if (s.phase === "pick" && now >= s.phaseEndsAt) return finishRound(s, now);
    if (s.phase === "reveal" && now >= s.phaseEndsAt) {
      if (s.round + 1 >= ROUNDS) return { ...s, phase: "done" };
      return { ...s, round: s.round + 1, phase: "pick", phaseEndsAt: now + PICK_MS, picks: [...s.picks, {}] };
    }
    return s;
  },
  isFinished: (s) => s.phase === "done",
  onTimeout: (s) => ({ ...s, phase: "done" }),
  results: (s) => rankByScore(s.players, s.points, true, (n) => `${n} ${n === 1 ? "win" : "wins"}`),
  publicState: (s) => ({
    round: s.round,
    total: ROUNDS,
    phase: s.phase,
    phaseEndsAt: s.phaseEndsAt,
    max: maxNumber(s.players.length),
    locked: Object.keys(s.picks[s.round] ?? {}),
    // Only reveal picks of finished rounds.
    revealed: s.picks.slice(0, s.phase === "pick" ? s.round : s.round + 1),
    winners: s.winners,
    points: s.points,
  }),
  privateState: (s, pid) => ({ myPick: s.picks[s.round]?.[pid] ?? null, bonus: s.bonuses.includes(pid) }),
};
