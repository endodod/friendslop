import { z } from "zod";
import { createRng, defineSoloGame } from "@party-game/shared";

const LONG = [
  "the quick brown fox jumps over the lazy dog",
  "never trust a friend who skips the last slice",
  "my backlog is longer than this sentence will ever be",
  "who left the aux cable plugged into the toaster",
  "pineapple on pizza is a lifestyle not a topping",
];
const SHORT = [
  "the quick brown fox jumps",
  "never trust a pizza thief",
  "my backlog keeps growing",
  "who took the aux cable",
  "pineapple is a lifestyle",
];

export function phrase(seed: number, bonus: boolean): string {
  const i = Math.floor(createRng(seed)() * LONG.length);
  return (bonus ? SHORT : LONG)[i];
}

export function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

export const ERROR_PENALTY_MS = 1500;

export const typeRace = defineSoloGame({
  id: "type-race",
  untimed: true,
  durationSec: 45,
  submitSchema: z.object({ typed: z.string().max(200), timeMs: z.number().finite().min(0).max(120000) }),
  higherIsBetter: false,
  label: (ms) => `${(ms / 1000).toFixed(1)} s`,
  score: (sub, { seed, bonus }) => {
    const target = phrase(seed, bonus);
    // Faster than ~25 characters per second isn't human.
    if (sub.timeMs < (sub.typed.length / 25) * 1000) return null;
    return Math.round(sub.timeMs + levenshtein(sub.typed.trim().toLowerCase(), target) * ERROR_PENALTY_MS);
  },
});
