import type { z } from "zod";
import type { Placement, PlayerId } from "../engine/types";
import type { MiniGameDefinition } from "./types";

/** Rank players by score. Ties share a rank; missing scores rank last. */
export function rankByScore(
  players: PlayerId[],
  scores: Record<PlayerId, number | null | undefined>,
  higherIsBetter = true,
  label?: (score: number) => string,
): Placement[] {
  const val = (p: PlayerId) => {
    const s = scores[p];
    if (s === null || s === undefined || Number.isNaN(s)) return higherIsBetter ? -Infinity : Infinity;
    return s;
  };
  const sorted = [...players].sort((a, b) => (higherIsBetter ? val(b) - val(a) : val(a) - val(b)));
  let rank = 0;
  return sorted.map((pid, i) => {
    if (i === 0 || val(sorted[i - 1]) !== val(pid)) rank = i + 1;
    const s = scores[pid];
    return {
      playerId: pid,
      rank,
      score: s ?? undefined,
      label: s === null || s === undefined ? "—" : label ? label(s) : String(s),
    };
  });
}

export interface SoloState {
  players: PlayerId[];
  bonuses: PlayerId[];
  seed: number;
  scores: Record<PlayerId, number | null>;
  submitted: PlayerId[];
  rejected: PlayerId[];
}

export interface SoloPublic {
  submitted: PlayerId[];
  scores: Record<PlayerId, number | null>;
  labels: Record<PlayerId, string>;
}

export interface SoloPrivate {
  bonus: boolean;
  submitted: boolean;
  rejected: boolean;
}

/**
 * Factory for soloScored mini-games: everyone plays locally from the same seed and submits
 * their inputs/score; the server re-computes or plausibility-checks it via `score`.
 */
export function defineSoloGame<Sub>(opts: {
  id: string;
  durationSec: number;
  minPlayers?: number;
  submitSchema: z.ZodType<Sub>;
  /** Validated score, or null to reject as implausible. */
  score(sub: Sub, ctx: { seed: number; bonus: boolean }): number | null;
  higherIsBetter?: boolean;
  label?: (score: number) => string;
}): MiniGameDefinition<SoloState, never, Sub> {
  const higher = opts.higherIsBetter ?? true;
  return {
    id: opts.id,
    kind: "soloScored",
    durationSec: opts.durationSec,
    minPlayers: opts.minPlayers ?? 2,
    submitSchema: opts.submitSchema,
    init: ({ players, bonuses, seed }) => ({
      players,
      bonuses,
      seed,
      scores: Object.fromEntries(players.map((p) => [p, null])),
      submitted: [],
      rejected: [],
    }),
    onSubmit: (state, pid, sub) => {
      if (state.submitted.includes(pid)) return state;
      const score = opts.score(sub, { seed: state.seed, bonus: state.bonuses.includes(pid) });
      return {
        ...state,
        submitted: [...state.submitted, pid],
        rejected: score === null ? [...state.rejected, pid] : state.rejected,
        scores: { ...state.scores, [pid]: score },
      };
    },
    isFinished: (s) => s.players.every((p) => s.submitted.includes(p)),
    results: (s) => rankByScore(s.players, s.scores, higher, opts.label),
    publicState: (s): SoloPublic => ({
      submitted: s.submitted,
      scores: s.scores,
      labels: Object.fromEntries(
        s.players.map((p) => [p, s.scores[p] == null ? "—" : opts.label ? opts.label(s.scores[p]!) : String(s.scores[p])]),
      ),
    }),
    privateState: (s, pid): SoloPrivate => ({
      bonus: s.bonuses.includes(pid),
      submitted: s.submitted.includes(pid),
      rejected: s.rejected.includes(pid),
    }),
  };
}
