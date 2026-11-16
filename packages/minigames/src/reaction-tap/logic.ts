import { z } from "zod";
import { GAME_CONFIG, createRng, defineSoloGame } from "@party-game/shared";

export const ROUNDS = 3;
export const FALSE_START_PENALTY_MS = 600;
export const MAX_REACTION_MS = 3000;

/** Same random "wait for green" delays for everyone. */
export function greenDelays(seed: number): number[] {
  const rng = createRng(seed);
  return Array.from({ length: ROUNDS }, () => 1200 + Math.floor(rng() * 2800));
}

const Submit = z.object({
  times: z.array(z.number().finite()).length(ROUNDS),
  falseStarts: z.number().int().min(0).max(20),
});

export const reactionTap = defineSoloGame({
  id: "reaction-tap",
  durationSec: 30,
  submitSchema: Submit,
  higherIsBetter: false,
  label: (ms) => `${Math.round(ms)} ms`,
  score: (sub, { bonus }) => {
    // Plausibility: humans can't react faster than ~100ms.
    if (sub.times.some((t) => t < GAME_CONFIG.minigame.minHumanReactionMs)) return null;
    const best = Math.min(...sub.times.map((t) => Math.min(t, MAX_REACTION_MS)));
    const penalized = Math.max(0, sub.falseStarts - (bonus ? 1 : 0));
    return best + penalized * FALSE_START_PENALTY_MS;
  },
});
