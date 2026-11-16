import { z } from "zod";
import { createRng, defineSoloGame, shuffle } from "@party-game/shared";

export const PAIRS = 8;
export const CARD_ICONS = ["food", "music", "gaming", "movies", "life", "chicken", "balloon", "crown", "potato", "bomb"];
export const MIN_MS_PER_FLIP = 120;
export const PEEK_MS = 1000;

/** Same layout for everyone: card index → icon id. */
export function layout(seed: number): string[] {
  const rng = createRng(seed);
  const icons = shuffle(rng, CARD_ICONS).slice(0, PAIRS);
  return shuffle(rng, [...icons, ...icons]);
}

/** Replay flips; returns whether all pairs were found by the end. */
export function replay(cards: string[], flips: number[]): { solved: boolean; valid: boolean } {
  const matched = new Set<number>();
  for (let i = 0; i + 1 < flips.length; i += 2) {
    const a = flips[i];
    const b = flips[i + 1];
    if (a === b || a < 0 || b < 0 || a >= cards.length || b >= cards.length) return { solved: false, valid: false };
    if (matched.has(a) || matched.has(b)) return { solved: false, valid: false };
    if (cards[a] === cards[b]) {
      matched.add(a);
      matched.add(b);
    }
  }
  return { solved: matched.size === cards.length, valid: true };
}

const Submit = z.object({ flips: z.array(z.number().int()).max(400), timeMs: z.number().finite().min(0) });

export const memoryFlip = defineSoloGame({
  id: "memory-flip",
  durationSec: 75,
  submitSchema: Submit,
  higherIsBetter: false,
  label: (ms) => (ms >= 1e6 ? "unfinished" : `${(ms / 1000).toFixed(1)} s`),
  score: (sub, { seed }) => {
    const r = replay(layout(seed), sub.flips);
    if (!r.valid) return null;
    if (sub.timeMs < sub.flips.length * MIN_MS_PER_FLIP) return null; // implausibly fast
    // Unfinished boards rank behind every finished one, by pairs found.
    if (!r.solved) return 1e6 - sub.flips.length;
    return sub.timeMs;
  },
});
