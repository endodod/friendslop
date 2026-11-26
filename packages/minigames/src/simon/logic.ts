import { z } from "zod";
import { createRng, defineSoloGame } from "@party-game/shared";

export const MAX_LEN = 30;
export const PADS = [
  { color: "#2fd27a", note: 0.8 },
  { color: "#ff4d5e", note: 1 },
  { color: "#ffc933", note: 1.2 },
  { color: "#3d8bff", note: 1.45 },
];

export function sequence(seed: number): number[] {
  const rng = createRng(seed);
  return Array.from({ length: MAX_LEN }, () => Math.floor(rng() * 4));
}

/** inputs = every pad press in order; level k requires pressing seq[0..k-1]. Returns the longest completed length. */
export function bestLength(seq: number[], inputs: number[]): number {
  let pos = 0;
  for (let k = 1; k <= seq.length; k++) {
    for (let i = 0; i < k; i++) {
      if (pos >= inputs.length) return k - 1;
      if (inputs[pos++] !== seq[i]) return k - 1;
    }
  }
  return seq.length;
}

export const simon = defineSoloGame({
  id: "simon",
  untimed: true,
  durationSec: 90,
  submitSchema: z.object({ inputs: z.array(z.number().int().min(0).max(3)).max(500) }),
  label: (n) => `${n} long`,
  score: (sub, { seed }) => bestLength(sequence(seed), sub.inputs),
});
