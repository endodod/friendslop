import { z } from "zod";
import { createRng, defineSoloGame } from "@party-game/shared";

export const FIELD = 100;
export const MAX_LEVELS = 20;
export const MIN_DROP_MS = 120;

export function startWidth(bonus: boolean) {
  return bonus ? 42 : 30;
}
/** Units per second for a level (gets faster). */
export function speedFor(level: number) {
  return Math.min(140, 45 + level * 7);
}

/** Slider x-position after t ms on a level (deterministic). */
export function sliderX(t: number, width: number, level: number, seed: number): number {
  const range = FIELD - width;
  if (range <= 0) return 0;
  const startRight = createRng(seed + level * 7919)() < 0.5;
  const p = ((speedFor(level) * t) / 1000) % (2 * range);
  const x = p <= range ? p : 2 * range - p;
  return startRight ? range - x : x;
}

export interface StackLevel {
  x: number;
  w: number;
}

/** Re-simulate a tower from drop times (ms since each level started). */
export function simulate(seed: number, bonus: boolean, drops: number[]): { levels: StackLevel[]; failedAt: number | null } {
  const w0 = startWidth(bonus);
  const levels: StackLevel[] = [{ x: (FIELD - w0) / 2, w: w0 }];
  for (let i = 0; i < Math.min(drops.length, MAX_LEVELS); i++) {
    const top = levels[levels.length - 1];
    const x = sliderX(drops[i], top.w, i + 1, seed);
    const left = Math.max(x, top.x);
    const right = Math.min(x + top.w, top.x + top.w);
    const w = right - left;
    if (w <= 0.5) return { levels, failedAt: i };
    levels.push({ x: left, w });
  }
  return { levels, failedAt: null };
}

/** Blocks stacked. Same height = same place (no hidden width tie-breaker). */
export function towerScore(levels: StackLevel[]) {
  return levels.length - 1;
}

const Submit = z.object({ drops: z.array(z.number().finite().min(0).max(60000)).max(MAX_LEVELS) });

export const stacker = defineSoloGame({
  id: "stacker",
  durationSec: 45,
  submitSchema: Submit,
  label: (s) => `${s} ${s === 1 ? "block" : "blocks"}`,
  score: (sub, { seed, bonus }) => {
    if (sub.drops.some((d) => d < MIN_DROP_MS)) return null;
    return towerScore(simulate(seed, bonus, sub.drops).levels);
  },
});
