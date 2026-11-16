import { z } from "zod";
import { createRng, defineSoloGame } from "@party-game/shared";

export const HOLES = 9;
export const GAME_MS = 22000;
export const UP_MS = 850;
export const BONUS_UP_MS = 1250;
export interface Pop { at: number; hole: number; bomb: boolean }

/** Same pop schedule for everyone. */
export function schedule(seed: number): Pop[] {
  const rng = createRng(seed);
  const pops: Pop[] = [];
  let t = 800;
  while (t < GAME_MS) {
    pops.push({ at: t, hole: Math.floor(rng() * HOLES), bomb: rng() < 0.22 });
    t += 380 + rng() * 520 - Math.min(250, t / 100);
  }
  return pops;
}

export const whackAMole = defineSoloGame({
  id: "whack-a-mole",
  durationSec: 30,
  submitSchema: z.object({ hits: z.array(z.number().int().min(0)).max(200) }),
  label: (n) => `${n} pts`,
  score: (sub, { seed }) => {
    const pops = schedule(seed);
    const uniq = [...new Set(sub.hits)].filter((i) => i < pops.length);
    return uniq.reduce((s, i) => s + (pops[i].bomb ? -3 : 1), 0);
  },
});
