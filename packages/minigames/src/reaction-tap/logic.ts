import { z } from "zod";
import { GAME_CONFIG, createRng, defineSoloGame } from "@party-game/shared";

export const ROUNDS = 3;
/** Question bonus: one extra try. */
export const BONUS_ROUNDS = ROUNDS + 1;
export const MAX_REACTION_MS = 3000;
/** Score of a disqualified player (false start): always last, ties with other false starts. */
export const DISQUALIFIED = 99_999;

/** Same random "wait for green" delays for everyone. */
export function greenDelays(seed: number): number[] {
  const rng = createRng(seed);
  return Array.from({ length: BONUS_ROUNDS }, () => 1200 + Math.floor(rng() * 2800));
}

const Submit = z.object({
  times: z.array(z.number().finite()).max(BONUS_ROUNDS),
  /** Tapped before green: out of this mini-game. */
  falseStart: z.boolean(),
});

export const reactionTap = defineSoloGame({
  id: "reaction-tap",
  durationSec: 30,
  submitSchema: Submit,
  higherIsBetter: false,
  label: (ms) => (ms >= DISQUALIFIED ? "False start" : `${Math.round(ms)} ms`),
  score: (sub, { bonus }) => {
    if (sub.falseStart) return DISQUALIFIED;
    // All tries played (one more with the bonus), and humans can't react faster than ~100ms.
    if (sub.times.length !== (bonus ? BONUS_ROUNDS : ROUNDS)) return null;
    if (sub.times.some((t) => t < GAME_CONFIG.minigame.minHumanReactionMs)) return null;
    // Best try counts.
    return Math.min(...sub.times.map((t) => Math.min(t, MAX_REACTION_MS)));
  },
});
