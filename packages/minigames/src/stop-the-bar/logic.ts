import { z } from "zod";
import { createRng, defineSoloGame } from "@party-game/shared";

export const ROUNDS = 3;
export interface BarRound { speed: number; center: number }

export function rounds(seed: number): BarRound[] {
  const rng = createRng(seed);
  return Array.from({ length: ROUNDS }, (_, i) => ({ speed: 70 + i * 35 + rng() * 25, center: 20 + rng() * 60 }));
}
export const zoneWidth = (bonus: boolean) => (bonus ? 22 : 14);

/** Bar position (0..100) after t ms in a round. */
export function barPos(t: number, r: BarRound): number {
  const p = ((r.speed * t) / 1000) % 200;
  return p <= 100 ? p : 200 - p;
}
/** 0..100 accuracy for a stop: 100 = dead center, 0 = outside the zone. */
export function accuracy(pos: number, r: BarRound, bonus: boolean): number {
  const half = zoneWidth(bonus) / 2;
  const d = Math.abs(pos - r.center);
  return d > half ? 0 : Math.round(100 - (d / half) * 50);
}

export const stopTheBar = defineSoloGame({
  id: "stop-the-bar",
  durationSec: 30,
  submitSchema: z.object({ stops: z.array(z.number().finite().min(0).max(30000)).length(ROUNDS) }),
  label: (s) => `${s} pts`,
  score: (sub, { seed, bonus }) => {
    if (sub.stops.some((t) => t < 150)) return null;
    const rs = rounds(seed);
    return sub.stops.reduce((sum, t, i) => sum + accuracy(barPos(t, rs[i]), rs[i], bonus), 0);
  },
});
