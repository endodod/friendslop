import { z } from "zod";
import { defineSoloGame } from "@party-game/shared";

export const GOAL_MS = 10000;
export const VISIBLE_MS = 3000;

export const perfectTiming = defineSoloGame({
  id: "perfect-timing",
  durationSec: 35,
  submitSchema: z.object({ elapsedMs: z.number().finite().min(0).max(60000) }),
  higherIsBetter: false,
  label: (d) => `±${(d / 1000).toFixed(2)} s`,
  score: (sub) => (sub.elapsedMs < 1000 ? null : Math.round(Math.abs(sub.elapsedMs - GOAL_MS))),
});
