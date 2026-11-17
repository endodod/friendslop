import { z } from "zod";
import { type MiniGameDefinition, type Placement, type PlayerId } from "@party-game/shared";

export const EARLY_MS = 200;
export const GRAB_MS = 3500;

export interface ChairsState {
  players: PlayerId[];
  bonuses: PlayerId[];
  alive: PlayerId[];
  /** Elimination order (first out first). */
  out: PlayerId[];
  round: number;
  stage: "music" | "grab" | "between";
  /** Secret while music plays: when the music stops. */
  stopAt: number;
  stageEndsAt: number;
  chairs: { x: number; y: number }[];
  seated: Record<number, PlayerId>;
}

export interface ChairsPublic {
  alive: PlayerId[];
  out: PlayerId[];
  round: number;
  stage: ChairsState["stage"];
  chairs: { x: number; y: number }[] | null;
  seated: Record<number, PlayerId>;
}

function newRound(s: ChairsState, now: number, rng: () => number): ChairsState {
  const n = s.alive.length - 1;
  // Spots on a 3×3 grid (with a little jitter) so up to 7 chairs never overlap.
  const spots = Array.from({ length: 9 }, (_, i) => ({ x: 8 + (i % 3) * 36 + rng() * 6, y: 8 + Math.floor(i / 3) * 33 + rng() * 6 }));
  for (let i = spots.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [spots[i], spots[j]] = [spots[j], spots[i]];
  }
  const chairs = spots.slice(0, n);
  const stopAt = now + 2500 + rng() * 4500;
  return { ...s, round: s.round + 1, stage: "music", stopAt, stageEndsAt: stopAt, chairs, seated: {} };
}

function chairsVisible(s: ChairsState, pid: PlayerId, now: number) {
  if (s.stage === "grab") return true;
  return s.stage === "music" && s.bonuses.includes(pid) && now >= s.stopAt - EARLY_MS;
}

export const musicalChairs: MiniGameDefinition<ChairsState, { chair: number }> = {
  id: "musical-chairs",
  kind: "sharedRealtime",
  durationSec: 60,
  minPlayers: 2,
  inputSchema: z.object({ chair: z.number().int().min(0).max(7) }),
  init: ({ players, bonuses, now, rng }) =>
    newRound({ players, bonuses, alive: [...players], out: [], round: 0, stage: "music", stopAt: 0, stageEndsAt: 0, chairs: [], seated: {} }, now, rng),
  onInput: (s, pid, { chair }, { now }) => {
    if (!s.alive.includes(pid) || !chairsVisible(s, pid, now)) return s;
    if (chair >= s.chairs.length || s.seated[chair] || Object.values(s.seated).includes(pid)) return s;
    return { ...s, seated: { ...s.seated, [chair]: pid } };
  },
  tick: (s, { now, rng }) => {
    if (s.stage === "music" && now >= s.stopAt) return { ...s, stage: "grab", stageEndsAt: now + GRAB_MS };
    const allSeated = Object.keys(s.seated).length >= s.chairs.length;
    if (s.stage === "grab" && (now >= s.stageEndsAt || allSeated)) {
      const seated = new Set(Object.values(s.seated));
      const losers = s.alive.filter((p) => !seated.has(p));
      return { ...s, stage: "between", stageEndsAt: now + 2200, alive: s.alive.filter((p) => seated.has(p)), out: [...s.out, ...losers] };
    }
    if (s.stage === "between" && now >= s.stageEndsAt && s.alive.length > 1) return newRound(s, now, rng);
    return s;
  },
  isFinished: (s, now) => s.stage === "between" && s.alive.length <= 1 && now >= s.stageEndsAt - 1500,
  results: (s) => {
    const order: PlayerId[][] = [s.alive];
    // Players eliminated in the same round share a rank.
    const outCopy = [...s.out].reverse();
    for (const p of outCopy) order.push([p]);
    const out: Placement[] = [];
    let rank = 1;
    for (const group of order) {
      for (const p of group) out.push({ playerId: p, rank, label: rank === 1 ? "Last one sitting" : "Out" });
      rank += group.length;
    }
    return out;
  },
  publicState: (s): ChairsPublic => ({
    alive: s.alive,
    out: s.out,
    round: s.round,
    stage: s.stage,
    chairs: s.stage === "music" ? null : s.chairs,
    seated: s.seated,
  }),
  privateState: (s, pid, now) => ({ bonus: s.bonuses.includes(pid), earlyChairs: s.stage === "music" && chairsVisible(s, pid, now) ? s.chairs : null }),
};
