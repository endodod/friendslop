import { z } from "zod";
import { createRng, defineSoloGame } from "@party-game/shared";

export const GAME_MS = 20000;
export const DIRS = ["up", "right", "down", "left"] as const;
export type Dir = (typeof DIRS)[number];
export interface Arrow { dir: Dir; /** Red arrows: press the OPPOSITE direction. */ flip: boolean }

export const opposite = (d: Dir): Dir => DIRS[(DIRS.indexOf(d) + 2) % 4];
export const expected = (a: Arrow): Dir => (a.flip ? opposite(a.dir) : a.dir);

/** Same arrow sequence for everyone. Red (flipped) arrows show up after the first few. */
export function arrows(seed: number, n = 150): Arrow[] {
  const rng = createRng(seed);
  return Array.from({ length: n }, (_, i) => ({ dir: DIRS[Math.floor(rng() * 4)], flip: i >= 5 && rng() < 0.3 }));
}

/** Score: +1 per correct arrow, −1 per wrong press. A wrong press doesn't advance. Bonus: mistakes are free. */
export function scoreRun(seed: number, presses: Dir[], bonus: boolean): number {
  const as = arrows(seed);
  let i = 0;
  let score = 0;
  for (const d of presses) {
    if (i >= as.length) break;
    if (d === expected(as[i])) {
      score += 1;
      i += 1;
    } else if (!bonus) score -= 1;
  }
  return Math.max(0, score);
}

export const arrowRush = defineSoloGame({
  id: "arrow-rush",
  durationSec: 28,
  submitSchema: z.object({ presses: z.array(z.enum(DIRS)).max(160) }),
  label: (n) => `${n} arrows`,
  score: (sub, { seed, bonus }) => {
    // More than ~7 presses per second isn't humanly possible.
    if (sub.presses.length > (GAME_MS / 1000) * 7) return null;
    return scoreRun(seed, sub.presses, bonus);
  },
});
