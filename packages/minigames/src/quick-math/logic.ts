import { z } from "zod";
import { createRng, defineSoloGame, shuffle } from "@party-game/shared";

export const BASE_MS = 20000;
export const BONUS_MS = 5000;
export interface Problem { text: string; answer: number; choices: number[] }

export function problems(seed: number, n = 80): Problem[] {
  const rng = createRng(seed);
  return Array.from({ length: n }, (_, i) => {
    const hard = i > 8;
    const op = Math.floor(rng() * (hard ? 3 : 2));
    const a = 2 + Math.floor(rng() * (hard ? 18 : 10));
    const b = 2 + Math.floor(rng() * (hard ? 12 : 9));
    const [text, answer] = op === 0 ? [`${a} + ${b}`, a + b] : op === 1 ? [`${a + b} − ${b}`, a] : [`${a} × ${b % 9 + 2}`, a * (b % 9 + 2)];
    const wrong = new Set<number>();
    while (wrong.size < 3) {
      const w = answer + (Math.floor(rng() * 9) - 4 || 5);
      if (w !== answer && w >= 0) wrong.add(w);
    }
    return { text, answer, choices: shuffle(rng, [answer, ...wrong]) };
  });
}

export const quickMath = defineSoloGame({
  id: "quick-math",
  durationSec: 32,
  submitSchema: z.object({ answers: z.array(z.number().finite()).max(80) }),
  label: (n) => `${n} solved`,
  score: (sub, { seed, bonus }) => {
    // At most ~3 answers per second is humanly possible.
    if (sub.answers.length > ((bonus ? BASE_MS + BONUS_MS : BASE_MS) / 1000) * 3) return null;
    const ps = problems(seed);
    let correct = 0;
    sub.answers.forEach((a, i) => (correct += a === ps[i]?.answer ? 1 : 0));
    return correct;
  },
});
