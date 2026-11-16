import { z } from "zod";
import { createRng, defineSoloGame, shuffle } from "@party-game/shared";

export const ICON_PAIRS: [string, string][] = [
  ["food", "life"], ["music", "sound"], ["coin", "coins"], ["bomb", "potato"], ["crown", "trophy"],
  ["chicken", "balloon"], ["gaming", "keyboard"], ["magnifier", "abacus"], ["star", "pick-target"],
];
export const MAX_LEVEL = 25;

export interface OddLevel { size: number; odd: number; common: string; oddIcon: string }

export function levels(seed: number, bonus: boolean): OddLevel[] {
  const rng = createRng(seed);
  return Array.from({ length: MAX_LEVEL }, (_, i) => {
    const size = Math.min(8, (bonus ? 2 : 3) + Math.floor(i / 2));
    const [a, b] = shuffle(rng, ICON_PAIRS[Math.floor(rng() * ICON_PAIRS.length)]);
    return { size, odd: Math.floor(rng() * size * size), common: a, oddIcon: b };
  });
}

/** Wrong taps cost a level of progress (can't go below 0). */
export function replay(ls: OddLevel[], taps: number[]): number {
  let lvl = 0;
  for (const t of taps) {
    if (lvl >= ls.length) break;
    if (t === ls[lvl].odd) lvl++;
    else lvl = Math.max(0, lvl - 1);
  }
  return lvl;
}

export const spotTheOdd = defineSoloGame({
  id: "spot-the-odd",
  durationSec: 32,
  submitSchema: z.object({ taps: z.array(z.number().int().min(0).max(63)).max(200) }),
  label: (n) => `level ${n}`,
  score: (sub, { seed, bonus }) => replay(levels(seed, bonus), sub.taps),
});
