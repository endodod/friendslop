import { z } from "zod";
import { shuffle, type MiniGameDefinition, type Placement, type PlayerId } from "@party-game/shared";

export const READY_MS = 2000;
export const PULL_MS = 20000;
/** Rope position runs from -LIMIT (left team wins) to +LIMIT (right team wins). */
export const LIMIT = 100;
/** How far one tap of a full team member moves the rope (scaled by team size). */
export const TAP_STEP = 4;
const MIN_TAP_INTERVAL_MS = 55;
const BONUS_STRENGTH = 1.25;

export interface TugState {
  players: PlayerId[];
  bonuses: PlayerId[];
  teams: [PlayerId[], PlayerId[]];
  startedAt: number;
  rope: number;
  taps: Record<PlayerId, number>;
  lastTapAt: Record<PlayerId, number>;
  winner: 0 | 1 | "tie" | null;
}

export const teamOf = (s: TugState, pid: PlayerId): 0 | 1 => (s.teams[0].includes(pid) ? 0 : 1);

export const tugOfWar: MiniGameDefinition<TugState, { tap: true }> = {
  id: "tug-of-war",
  kind: "sharedRealtime",
  durationSec: (READY_MS + PULL_MS) / 1000 + 3,
  minPlayers: 2,
  inputSchema: z.object({ tap: z.literal(true) }),
  init: ({ players, bonuses, rng, now }) => {
    const mixed = shuffle(rng, [...players]);
    const half = Math.ceil(mixed.length / 2);
    return {
      players,
      bonuses,
      teams: [mixed.slice(0, half), mixed.slice(half)],
      startedAt: now,
      rope: 0,
      taps: Object.fromEntries(players.map((p) => [p, 0])),
      lastTapAt: {},
      winner: null,
    };
  },
  onInput: (s, pid, _input, { now }) => {
    if (s.winner !== null || now < s.startedAt + READY_MS) return s;
    if (now - (s.lastTapAt[pid] ?? 0) < MIN_TAP_INTERVAL_MS) return s;
    const team = teamOf(s, pid);
    // Smaller teams pull harder per person so uneven teams stay fair.
    const strength = (TAP_STEP * (s.players.length / 2)) / s.teams[team].length;
    const pull = strength * (s.bonuses.includes(pid) ? BONUS_STRENGTH : 1) * (team === 0 ? -1 : 1);
    const rope = Math.max(-LIMIT, Math.min(LIMIT, s.rope + pull));
    const winner = rope <= -LIMIT ? 0 : rope >= LIMIT ? 1 : null;
    return { ...s, rope, winner, taps: { ...s.taps, [pid]: s.taps[pid] + 1 }, lastTapAt: { ...s.lastTapAt, [pid]: now } };
  },
  tick: (s, { now }) => {
    if (s.winner !== null || now < s.startedAt + READY_MS + PULL_MS) return s;
    return { ...s, winner: s.rope < 0 ? 0 : s.rope > 0 ? 1 : "tie" };
  },
  isFinished: (s) => s.winner !== null,
  onTimeout: (s) => (s.winner !== null ? s : { ...s, winner: s.rope < 0 ? 0 : s.rope > 0 ? 1 : "tie" }),
  results: (s): Placement[] => {
    const won = (pid: PlayerId) => s.winner === "tie" || s.winner === teamOf(s, pid);
    const winners = s.players.filter(won);
    return s.players.map((pid) => ({
      playerId: pid,
      rank: won(pid) ? 1 : winners.length + 1,
      score: s.taps[pid],
      label: `${won(pid) ? "Won" : "Lost"} · ${s.taps[pid]} pulls`,
    }));
  },
  publicState: (s) => ({
    teams: s.teams,
    startedAt: s.startedAt,
    rope: s.rope,
    taps: s.taps,
    winner: s.winner,
  }),
  privateState: (s, pid) => ({ team: teamOf(s, pid), bonus: s.bonuses.includes(pid) }),
};
