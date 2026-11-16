import { z } from "zod";
import { createRng, defineSoloGame } from "@party-game/shared";

export const ROUNDS = 3;
export const KINDS = ["star", "coin", "bomb"];
export const FLASH_MS = 1500;
export const BONUS_FLASH_MS = 2500;
export interface CountRound { items: { kind: number; x: number; y: number }[]; ask: number; answer: number }

export function rounds(seed: number): CountRound[] {
  const rng = createRng(seed);
  return Array.from({ length: ROUNDS }, (_, r) => {
    const n = 14 + r * 6 + Math.floor(rng() * 6);
    const items = Array.from({ length: n }, () => ({ kind: Math.floor(rng() * 3), x: 4 + rng() * 88, y: 4 + rng() * 88 }));
    const ask = Math.floor(rng() * 3);
    return { items, ask, answer: items.filter((i) => i.kind === ask).length };
  });
}

export const countIt = defineSoloGame({
  id: "count-it",
  durationSec: 50,
  submitSchema: z.object({ counts: z.array(z.number().int().min(0).max(99)).length(ROUNDS) }),
  higherIsBetter: false,
  label: (d) => `off by ${d}`,
  score: (sub, { seed }) => rounds(seed).reduce((s, r, i) => s + Math.abs(sub.counts[i] - r.answer), 0),
});
