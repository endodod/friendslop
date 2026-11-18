import { z } from "zod";
import { rankByScore, type MiniGameDefinition, type PlayerId } from "@party-game/shared";

export const TILES = 16;
export const TURN_MS = 8000;
export const CLEARED_MS = 2000;

export interface MinefieldState {
  players: PlayerId[];
  bonuses: PlayerId[];
  alive: PlayerId[];
  out: PlayerId[];
  grid: number;
  /** Secret. */
  bomb: number;
  /** Secret per bonus player: one safe tile. */
  safeHint: Record<PlayerId, number>;
  opened: number[];
  turn: number;
  turnEndsAt: number;
  boom: { tile: number; playerId: PlayerId; until: number } | null;
  /** Every safe tile was opened: nobody has to take the bomb. Short pause, then a new field. */
  cleared: { until: number } | null;
}

function newGrid(s: MinefieldState, now: number, rng: () => number): MinefieldState {
  const bomb = Math.floor(rng() * TILES);
  // Each bonus player gets their own safe tile (never the same as anyone else's).
  const safe = Array.from({ length: TILES }, (_, i) => i).filter((i) => i !== bomb);
  for (let i = safe.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [safe[i], safe[j]] = [safe[j], safe[i]];
  }
  const safeHint: Record<PlayerId, number> = {};
  s.bonuses.filter((b) => s.alive.includes(b)).forEach((b, i) => (safeHint[b] = safe[i % safe.length]));
  return { ...s, grid: s.grid + 1, bomb, safeHint, opened: [], boom: null, cleared: null, turnEndsAt: now + TURN_MS };
}

const current = (s: MinefieldState) => s.alive[s.turn % s.alive.length];

function pickTile(s: MinefieldState, pid: PlayerId, tile: number, now: number): MinefieldState {
  if (tile === s.bomb) {
    const alive = s.alive.filter((p) => p !== pid);
    return { ...s, alive, out: [...s.out, pid], boom: { tile, playerId: pid, until: now + 2500 }, opened: [...s.opened, tile], turn: s.turn % Math.max(1, alive.length) };
  }
  const opened = [...s.opened, tile];
  const next = { ...s, opened, turn: (s.turn + 1) % s.alive.length, turnEndsAt: now + TURN_MS };
  // Only the bomb is left: don't force the next player onto it. New field after a short pause.
  if (opened.length >= TILES - 1) return { ...next, cleared: { until: now + CLEARED_MS } };
  return next;
}

export const minefield: MiniGameDefinition<MinefieldState, { tile: number }> = {
  id: "minefield",
  kind: "turnBased",
  durationSec: 120,
  minPlayers: 2,
  inputSchema: z.object({ tile: z.number().int().min(0).max(TILES - 1) }),
  init: ({ players, bonuses, now, rng }) =>
    newGrid({ players, bonuses, alive: [...players], out: [], grid: 0, bomb: 0, safeHint: {}, opened: [], turn: 0, turnEndsAt: now, boom: null, cleared: null }, now, rng),
  onInput: (s, pid, { tile }, { now }) => {
    if (s.boom || s.cleared || current(s) !== pid || s.opened.includes(tile)) return s;
    return pickTile(s, pid, tile, now);
  },
  tick: (s, { now, rng }) => {
    if (s.boom) {
      if (now >= s.boom.until && s.alive.length > 1) return newGrid(s, now, rng);
      return s;
    }
    if (s.cleared) return now >= s.cleared.until ? newGrid(s, now, rng) : s;
    if (now >= s.turnEndsAt) {
      const free = Array.from({ length: TILES }, (_, i) => i).filter((i) => !s.opened.includes(i));
      return pickTile(s, current(s), free[Math.floor(rng() * free.length)], now);
    }
    return s;
  },
  isFinished: (s, now) => s.alive.length <= 1 && (!s.boom || now >= s.boom.until - 1000),
  results: (s) => rankByScore(s.players, Object.fromEntries(s.players.map((p) => [p, s.alive.includes(p) ? 100 : s.out.indexOf(p)])), true, (v) => (v === 100 ? "Survivor" : "Boom")),
  publicState: (s) => ({ alive: s.alive, out: s.out, opened: s.opened, current: s.boom ? null : current(s), turnEndsAt: s.turnEndsAt, boom: s.boom, cleared: !!s.cleared, grid: s.grid }),
  privateState: (s, pid) => ({ safe: s.safeHint[pid] !== undefined && !s.opened.includes(s.safeHint[pid]) ? s.safeHint[pid] : null }),
};
