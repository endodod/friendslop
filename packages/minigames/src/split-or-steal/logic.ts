import { z } from "zod";
import { type MiniGameDefinition, type PlayerId } from "@party-game/shared";

export const POT = 10;
export const DECIDE_MS = 12000;
export const SLOW_MS = 3000;
export const REVEAL_MS = 4000;
type Choice = "split" | "steal";

export interface SplitState {
  players: PlayerId[];
  bonuses: PlayerId[];
  startedAt: number;
  choices: Record<PlayerId, Choice>;
  decidedAt: Record<PlayerId, number>;
  revealUntil: number | null;
}

export function payoutFor(a: Choice | undefined, b: Choice | undefined): [number, number] {
  const ca = a ?? "split";
  const cb = b ?? "split";
  if (ca === "split" && cb === "split") return [POT / 2, POT / 2];
  if (ca === "steal" && cb === "split") return [POT, 0];
  if (ca === "split" && cb === "steal") return [0, POT];
  return [0, 0];
}

export const splitOrSteal: MiniGameDefinition<SplitState, { choice: Choice }> = {
  id: "split-or-steal",
  kind: "turnBased",
  durationSec: 25,
  minPlayers: 2,
  maxPlayers: 2,
  inputSchema: z.object({ choice: z.enum(["split", "steal"]) }),
  init: ({ players, bonuses, now }) => ({ players, bonuses, startedAt: now, choices: {}, decidedAt: {}, revealUntil: null }),
  onInput: (s, pid, { choice }, { now }) =>
    s.choices[pid] || s.revealUntil ? s : { ...s, choices: { ...s.choices, [pid]: choice }, decidedAt: { ...s.decidedAt, [pid]: now } },
  tick: (s, { now }) => {
    if (s.revealUntil) return s;
    if (s.players.every((p) => s.choices[p]) || now >= s.startedAt + DECIDE_MS) return { ...s, revealUntil: now + REVEAL_MS };
    return s;
  },
  isFinished: (s, now) => s.revealUntil !== null && now >= s.revealUntil,
  results: (s) => {
    const [a, b] = s.players;
    const [pa, pb] = payoutFor(s.choices[a], s.choices[b]);
    return [
      { playerId: a, rank: pa >= pb ? 1 : 2, label: s.choices[a] ?? "split (timeout)" },
      { playerId: b, rank: pb >= pa ? 1 : 2, label: s.choices[b] ?? "split (timeout)" },
    ];
  },
  payout: (s) => {
    const [a, b] = s.players;
    const [pa, pb] = payoutFor(s.choices[a], s.choices[b]);
    return { [a]: pa, [b]: pb };
  },
  publicState: (s) => ({
    startedAt: s.startedAt,
    decided: Object.keys(s.choices),
    choices: s.revealUntil ? s.choices : null,
    revealed: s.revealUntil !== null,
  }),
  privateState: (s, pid, now) => {
    const other = s.players.find((p) => p !== pid)!;
    const bonus = s.bonuses.includes(pid);
    const otherDecided = s.decidedAt[other];
    const otherSlow = bonus && now >= s.startedAt + SLOW_MS ? !(otherDecided && otherDecided - s.startedAt <= SLOW_MS) : null;
    return { myChoice: s.choices[pid] ?? null, bonus, otherSlow };
  },
};
