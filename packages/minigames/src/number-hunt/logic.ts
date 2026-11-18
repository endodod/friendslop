import { z } from "zod";
import { createRng, defineSoloGame, shuffle } from "@party-game/shared";

export const SIZE = 5;
export const COUNT = SIZE * SIZE;
export const GAME_MS = 40000;
export const MISS_PENALTY_MS = 1000;
/** Bonus: numbers 1..BONUS_HEAD are already found. */
export const BONUS_HEAD = 3;

/** Cell index → number shown (1..25). */
export function grid(seed: number): number[] {
  return shuffle(createRng(seed), Array.from({ length: COUNT }, (_, i) => i + 1));
}

export const firstNumber = (bonus: boolean) => (bonus ? BONUS_HEAD + 1 : 1);

/** Replays taps: how many numbers were found and how many taps missed. */
export function replay(cells: number[], taps: number[], bonus: boolean): { found: number; misses: number } {
  let next = firstNumber(bonus);
  let misses = 0;
  for (const t of taps) {
    if (next > COUNT) break;
    if (cells[t] === next) next += 1;
    else misses += 1;
  }
  return { found: next - 1, misses };
}

/**
 * Lower is better. Finished: time + 1 s per wrong tap. Unfinished: ranked after everyone who
 * finished, by how many numbers they found.
 */
export function huntScore(found: number, misses: number, timeMs: number): number {
  if (found >= COUNT) return Math.round(timeMs + misses * MISS_PENALTY_MS);
  return 1_000_000 + (COUNT - found) * 1000;
}

export const huntLabel = (s: number) => (s >= 1_000_000 ? `${COUNT - (s - 1_000_000) / 1000}/${COUNT} found` : `${(s / 1000).toFixed(1)}s`);

export const numberHunt = defineSoloGame({
  id: "number-hunt",
  durationSec: 46,
  submitSchema: z.object({ taps: z.array(z.number().int().min(0).max(COUNT - 1)).max(200), timeMs: z.number().finite().min(0).max(60000) }),
  higherIsBetter: false,
  label: huntLabel,
  score: (sub, { seed, bonus }) => {
    const { found, misses } = replay(grid(seed), sub.taps, bonus);
    const needed = found - (firstNumber(bonus) - 1);
    // Finding a number takes at least ~180 ms (look + tap).
    if (needed > 0 && sub.timeMs < needed * 180) return null;
    return huntScore(found, misses, sub.timeMs);
  },
});
