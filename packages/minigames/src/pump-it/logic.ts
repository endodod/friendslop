import { z } from "zod";
import { rankByScore, type MiniGameDefinition, type PlayerId } from "@party-game/shared";

export const BALLOONS = 3;
const MIN_PUMP_INTERVAL_MS = 55;

interface Balloon {
  pumps: number;
  popped: boolean;
  banked: boolean;
}
interface PlayerRun {
  balloons: Balloon[];
  current: number;
  lastPumpAt: number;
}
export interface PumpState {
  players: PlayerId[];
  bonuses: PlayerId[];
  /** Secret: pumps at which each balloon pops (same for everyone). */
  popAt: number[];
  hints: { lo: number; hi: number }[];
  runs: Record<PlayerId, PlayerRun>;
}

export interface PumpPublic {
  runs: Record<PlayerId, { balloons: Balloon[]; current: number; total: number; done: boolean }>;
}
export interface PumpPrivate {
  bonus: boolean;
  hint: { lo: number; hi: number } | null;
}

const total = (r: PlayerRun) => r.balloons.reduce((s, b) => s + (b.banked && !b.popped ? b.pumps : 0), 0);
const done = (r: PlayerRun) => r.current >= BALLOONS;

export const pumpIt: MiniGameDefinition<PumpState, { action: "pump" | "stop" }> = {
  id: "pump-it",
  kind: "soloScored",
  durationSec: 40,
  minPlayers: 2,
  inputSchema: z.object({ action: z.enum(["pump", "stop"]) }),
  init: ({ players, bonuses, rng }) => {
    const popAt = Array.from({ length: BALLOONS }, () => 6 + Math.floor(rng() * 24));
    const hints = popAt.map((p) => {
      const lo = Math.max(1, p - 1 - Math.floor(rng() * 6));
      return { lo, hi: lo + 7 };
    });
    return {
      players,
      bonuses,
      popAt,
      hints,
      runs: Object.fromEntries(
        players.map((pid) => [
          pid,
          { balloons: Array.from({ length: BALLOONS }, () => ({ pumps: 0, popped: false, banked: false })), current: 0, lastPumpAt: 0 },
        ]),
      ),
    };
  },
  onInput: (s, pid, input, { now }) => {
    const run = s.runs[pid];
    if (!run || done(run)) return s;
    const runs = { ...s.runs };
    const r: PlayerRun = { ...run, balloons: run.balloons.map((b) => ({ ...b })) };
    const b = r.balloons[r.current];
    if (input.action === "pump") {
      if (now - r.lastPumpAt < MIN_PUMP_INTERVAL_MS) return s; // too fast to be human
      r.lastPumpAt = now;
      b.pumps++;
      if (b.pumps >= s.popAt[r.current]) {
        b.popped = true;
        r.current++;
      }
    } else {
      if (b.pumps === 0) return s;
      b.banked = true;
      r.current++;
    }
    runs[pid] = r;
    return { ...s, runs };
  },
  isFinished: (s) => s.players.every((p) => done(s.runs[p])),
  onTimeout: (s) => ({
    ...s,
    runs: Object.fromEntries(
      Object.entries(s.runs).map(([pid, r]) => [
        pid,
        { ...r, balloons: r.balloons.map((b) => (b.popped || b.banked ? b : { ...b, banked: b.pumps > 0 })), current: BALLOONS },
      ]),
    ),
  }),
  results: (s) =>
    rankByScore(
      s.players,
      Object.fromEntries(s.players.map((p) => [p, total(s.runs[p])])),
      true,
      (n) => `${n} pumps`,
    ),
  publicState: (s): PumpPublic => ({
    runs: Object.fromEntries(
      Object.entries(s.runs).map(([pid, r]) => [pid, { balloons: r.balloons, current: r.current, total: total(r), done: done(r) }]),
    ),
  }),
  privateState: (s, pid): PumpPrivate => {
    const r = s.runs[pid];
    const bonus = s.bonuses.includes(pid);
    return { bonus, hint: bonus && r && !done(r) ? s.hints[r.current] : null };
  },
};
