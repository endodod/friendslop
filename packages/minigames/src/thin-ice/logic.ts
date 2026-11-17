import { z } from "zod";
import { type MiniGameDefinition, type Placement, type PlayerId } from "@party-game/shared";

export const SIZE = 6;
export const TURN_MS = 7000;
// Corners first, then edge middles (up to 8 players).
const START = [0, SIZE * SIZE - 1, SIZE - 1, SIZE * (SIZE - 1), 3, SIZE * SIZE - 4, 3 * SIZE, 3 * SIZE - 1];

export interface ThinIceState {
  players: PlayerId[];
  pos: Record<PlayerId, number>;
  broken: number[];
  alive: PlayerId[];
  out: PlayerId[];
  turn: number;
  turnEndsAt: number;
}

export function neighbors(c: number): number[] {
  const x = c % SIZE;
  const y = Math.floor(c / SIZE);
  const out: number[] = [];
  for (let dx = -1; dx <= 1; dx++)
    for (let dy = -1; dy <= 1; dy++) {
      if (!dx && !dy) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < SIZE && ny < SIZE) out.push(ny * SIZE + nx);
    }
  return out;
}

export function validMoves(s: ThinIceState, pid: PlayerId): number[] {
  const occupied = new Set(s.alive.map((p) => s.pos[p]));
  return neighbors(s.pos[pid]).filter((c) => !s.broken.includes(c) && !occupied.has(c));
}

const current = (s: ThinIceState) => s.alive[s.turn % s.alive.length];

/** Advance to the next player who can move; players with no moves fall in. */
function nextTurn(s: ThinIceState, now: number): ThinIceState {
  let st = { ...s, turn: s.turn + 1 };
  for (let guard = 0; guard < 8 && st.alive.length > 1; guard++) {
    const pid = current(st);
    if (validMoves(st, pid).length) return { ...st, turnEndsAt: now + TURN_MS };
    const idx = st.alive.indexOf(pid);
    st = { ...st, alive: st.alive.filter((p) => p !== pid), out: [...st.out, pid], turn: idx };
  }
  return { ...st, turnEndsAt: now + TURN_MS };
}

function move(s: ThinIceState, pid: PlayerId, cell: number, now: number): ThinIceState {
  const from = s.pos[pid];
  return nextTurn({ ...s, pos: { ...s.pos, [pid]: cell }, broken: [...s.broken, from], turn: s.alive.indexOf(pid) }, now);
}

export const thinIce: MiniGameDefinition<ThinIceState, { cell: number }> = {
  id: "thin-ice",
  kind: "turnBased",
  durationSec: 150,
  minPlayers: 2,
  inputSchema: z.object({ cell: z.number().int().min(0).max(SIZE * SIZE - 1) }),
  init: ({ players, bonuses, now, rng }) => {
    const pos = Object.fromEntries(players.map((p, i) => [p, START[i]]));
    // Pre-cracked holes; never right next to a bonus player's start.
    const protectedCells = new Set(players.flatMap((p) => [pos[p], ...(bonuses.includes(p) ? neighbors(pos[p]) : [])]));
    const broken: number[] = [];
    while (broken.length < 6) {
      const c = Math.floor(rng() * SIZE * SIZE);
      if (!protectedCells.has(c) && !broken.includes(c)) broken.push(c);
    }
    return { players, pos, broken, alive: [...players], out: [], turn: 0, turnEndsAt: now + TURN_MS };
  },
  onInput: (s, pid, { cell }, { now }) => {
    if (s.alive.length <= 1 || current(s) !== pid || !validMoves(s, pid).includes(cell)) return s;
    return move(s, pid, cell, now);
  },
  tick: (s, { now, rng }) => {
    if (s.alive.length <= 1 || now < s.turnEndsAt) return s;
    const pid = current(s);
    const moves = validMoves(s, pid);
    if (!moves.length) return nextTurn({ ...s, turn: s.turn - 1 }, now);
    return move(s, pid, moves[Math.floor(rng() * moves.length)], now);
  },
  isFinished: (s) => s.alive.length <= 1,
  results: (s) => {
    const order: Placement[] = s.alive.map((p) => ({ playerId: p, rank: 1, label: "Survivor" }));
    [...s.out].reverse().forEach((p, i) => order.push({ playerId: p, rank: s.alive.length + i + 1, label: "Fell in" }));
    return order;
  },
  publicState: (s) => ({ pos: s.pos, broken: s.broken, alive: s.alive, current: s.alive.length > 1 ? current(s) : null, turnEndsAt: s.turnEndsAt }),
};
