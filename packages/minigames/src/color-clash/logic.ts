import { z } from "zod";
import { createRng, defineSoloGame } from "@party-game/shared";

export const BASE_MS = 20000;
export const BONUS_MS = 3000;
export const COLORS = [
  { id: "red", word: "RED", hex: "#ff4d5e" },
  { id: "blue", word: "BLUE", hex: "#3d8bff" },
  { id: "green", word: "GREEN", hex: "#2fd27a" },
  { id: "yellow", word: "YELLOW", hex: "#ffc933" },
] as const;

export function cards(seed: number, n = 120): { word: number; ink: number }[] {
  const rng = createRng(seed);
  return Array.from({ length: n }, () => {
    const word = Math.floor(rng() * 4);
    let ink = Math.floor(rng() * 4);
    if (rng() < 0.75 && ink === word) ink = (ink + 1 + Math.floor(rng() * 3)) % 4;
    return { word, ink };
  });
}

export const colorClash = defineSoloGame({
  id: "color-clash",
  durationSec: 32,
  submitSchema: z.object({ picks: z.array(z.number().int().min(0).max(3)).max(120) }),
  label: (n) => `${n} correct`,
  score: (sub, { seed, bonus }) => {
    if (sub.picks.length > ((bonus ? BASE_MS + BONUS_MS : BASE_MS) / 1000) * 4) return null;
    const cs = cards(seed);
    let s = 0;
    sub.picks.forEach((pick, i) => (s += pick === cs[i].ink ? 1 : -1));
    return Math.max(0, s);
  },
});
