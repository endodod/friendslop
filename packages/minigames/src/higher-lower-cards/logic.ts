import { z } from "zod";
import { createRng, defineSoloGame } from "@party-game/shared";

export const DECK = 60;
export function deck(seed: number): number[] {
  const rng = createRng(seed);
  return Array.from({ length: DECK }, () => 1 + Math.floor(rng() * 13));
}
export const CARD_LABEL = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

/** Replay guesses. Equal cards count as correct. A skip (bonus, once) moves on without scoring. */
export function streak(cards: number[], guesses: ("h" | "l" | "s")[], bonus: boolean): number {
  let s = 0;
  let skips = bonus ? 1 : 0;
  for (let i = 0; i < guesses.length && i + 1 < cards.length; i++) {
    const g = guesses[i];
    if (g === "s") {
      if (skips-- <= 0) return s;
      continue;
    }
    const ok = cards[i + 1] === cards[i] || (g === "h" ? cards[i + 1] > cards[i] : cards[i + 1] < cards[i]);
    if (!ok) return s;
    s++;
  }
  return s;
}

export const higherLowerCards = defineSoloGame({
  id: "higher-lower-cards",
  untimed: true,
  durationSec: 45,
  submitSchema: z.object({ guesses: z.array(z.enum(["h", "l", "s"])).max(DECK) }),
  label: (n) => `${n} streak`,
  score: (sub, { seed, bonus }) => streak(deck(seed), sub.guesses, bonus),
});
