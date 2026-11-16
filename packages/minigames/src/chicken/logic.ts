import { z } from "zod";
import { rankByScore, type MiniGameDefinition, type PlayerId } from "@party-game/shared";

/** Players have this long to grab the button before the pot starts growing. */
export const JOIN_MS = 3000;

/** Pot value after t ms of growth. */
export function potAt(ms: number): number {
  const t = Math.max(0, ms) / 1000;
  return Math.floor(10 + 6 * t + 1.6 * t * t);
}

type Status = "waiting" | "holding" | "cashed" | "busted" | "out";

export interface ChickenState {
  players: PlayerId[];
  bonuses: PlayerId[];
  growStartsAt: number;
  /** Secret crash time. */
  crashAt: number;
  range: { lo: number; hi: number };
  status: Record<PlayerId, Status>;
  cashed: Record<PlayerId, number>;
  crashed: boolean;
}

export interface ChickenPublic {
  growStartsAt: number;
  pot: number;
  status: Record<PlayerId, Status>;
  cashed: Record<PlayerId, number>;
  crashed: boolean;
  crashPot: number | null;
}

export const chicken: MiniGameDefinition<ChickenState, { hold: boolean }> = {
  id: "chicken",
  kind: "sharedRealtime",
  durationSec: 30,
  minPlayers: 2,
  inputSchema: z.object({ hold: z.boolean() }),
  init: ({ players, bonuses, now, rng }) => {
    const growStartsAt = now + JOIN_MS;
    const crashMs = 3500 + rng() * 11000;
    const lo = Math.max(0, crashMs - 1000 - rng() * 2500);
    return {
      players,
      bonuses,
      growStartsAt,
      crashAt: growStartsAt + crashMs,
      range: { lo: potAt(lo), hi: potAt(lo + 3500) },
      status: Object.fromEntries(players.map((p) => [p, "waiting" as Status])),
      cashed: {},
      crashed: false,
    };
  },
  onInput: (s, pid, { hold }, { now }) => {
    const st = s.status[pid];
    if (s.crashed) return s;
    if (hold && st === "waiting") return { ...s, status: { ...s.status, [pid]: "holding" } };
    if (!hold && st === "holding") {
      if (now < s.growStartsAt) return { ...s, status: { ...s.status, [pid]: "waiting" } };
      return { ...s, status: { ...s.status, [pid]: "cashed" }, cashed: { ...s.cashed, [pid]: potAt(Math.min(now, s.crashAt) - s.growStartsAt) } };
    }
    return s;
  },
  tick: (s, { now }) => {
    if (s.crashed) return s;
    if (now >= s.growStartsAt) {
      // Never grabbed the button → out.
      if (s.players.some((p) => s.status[p] === "waiting"))
        s = { ...s, status: Object.fromEntries(s.players.map((p) => [p, s.status[p] === "waiting" ? "out" : s.status[p]])) as Record<PlayerId, Status> };
    }
    if (now >= s.crashAt) {
      return {
        ...s,
        crashed: true,
        status: Object.fromEntries(s.players.map((p) => [p, s.status[p] === "holding" ? "busted" : s.status[p]])) as Record<PlayerId, Status>,
      };
    }
    return s;
  },
  isFinished: (s, now) => s.crashed || (now >= s.growStartsAt && s.players.every((p) => s.status[p] !== "holding" && s.status[p] !== "waiting")),
  onTimeout: (s) => ({ ...s, crashed: true }),
  results: (s) =>
    rankByScore(s.players, Object.fromEntries(s.players.map((p) => [p, s.cashed[p] ?? 0])), true, (v) => (v ? `cashed ${v}` : "busted")),
  publicState: (s, now): ChickenPublic => ({
    growStartsAt: s.growStartsAt,
    pot: potAt(Math.min(now, s.crashAt) - s.growStartsAt),
    status: s.status,
    cashed: s.cashed,
    crashed: s.crashed,
    crashPot: s.crashed ? potAt(s.crashAt - s.growStartsAt) : null,
  }),
  privateState: (s, pid) => ({ bonus: s.bonuses.includes(pid), range: s.bonuses.includes(pid) ? s.range : null }),
};
