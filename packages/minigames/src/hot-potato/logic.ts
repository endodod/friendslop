import { z } from "zod";
import { shuffle, type MiniGameDefinition, type Placement, type PlayerId } from "@party-game/shared";

/**
 * Quick reflex challenges (no maths): match the picture, tap the ink colour, find the odd one out,
 * count the dots. `choices` are what the buttons show; `answer` (secret) is the right index.
 */
export type Prompt =
  | { kind: "match"; icon: string; choices: string[]; answer: number }
  | { kind: "ink"; word: string; ink: string; choices: string[]; answer: number }
  | { kind: "odd"; choices: string[]; answer: number }
  | { kind: "count"; dots: { x: number; y: number }[]; choices: string[]; answer: number };

export const POTATO_ICONS = ["food", "music", "gaming", "movies", "chicken", "balloon", "crown", "potato", "star", "trophy", "coin", "magnet"];
export const POTATO_COLORS = [
  { name: "RED", hex: "#ff4d5e" },
  { name: "BLUE", hex: "#3d8bff" },
  { name: "GREEN", hex: "#2fd27a" },
  { name: "YELLOW", hex: "#ffc933" },
];

export interface PotatoState {
  players: PlayerId[];
  bonuses: PlayerId[];
  alive: PlayerId[];
  out: PlayerId[];
  holder: PlayerId;
  prompt: Prompt;
  /** Secret fuse. */
  explodeAt: number;
  boomUntil: number | null;
  /** Who the last explosion hit, and whether their bonus revive saved them. */
  boomPlayer: PlayerId | null;
  boomRevive: boolean;
  /** Bonus players who already used their one revive. */
  revived: PlayerId[];
  lockedUntil: number;
}

function makePrompt(rng: () => number): Prompt {
  const pickN = <T,>(arr: T[], n: number) => shuffle(rng, arr).slice(0, n);
  const kind = (["match", "ink", "odd", "count"] as const)[Math.floor(rng() * 4)];
  if (kind === "match") {
    const choices = pickN(POTATO_ICONS, 3);
    const answer = Math.floor(rng() * 3);
    return { kind, icon: choices[answer], choices, answer };
  }
  if (kind === "ink") {
    const [ink, word, other] = pickN(POTATO_COLORS, 3);
    const choices = shuffle(rng, [ink.hex, word.hex, other.hex]);
    return { kind, word: word.name, ink: ink.hex, choices, answer: choices.indexOf(ink.hex) };
  }
  if (kind === "odd") {
    const [same, odd] = pickN(POTATO_ICONS, 2);
    const answer = Math.floor(rng() * 3);
    return { kind, choices: [0, 1, 2].map((i) => (i === answer ? odd : same)), answer };
  }
  const n = 2 + Math.floor(rng() * 6); // 2–7 dots
  const dots: { x: number; y: number }[] = [];
  while (dots.length < n) {
    // The dot box is about 3.3× wider than tall, so vertical distance counts for less.
    const d = { x: 8 + rng() * 84, y: 18 + rng() * 64 };
    if (dots.every((o) => Math.hypot(o.x - d.x, (o.y - d.y) * 0.3) > 9)) dots.push(d);
  }
  const wrong = shuffle(rng, [n - 2, n - 1, n + 1, n + 2].filter((v) => v >= 1)).slice(0, 2);
  const choices = shuffle(rng, [n, ...wrong]).map(String);
  return { kind, dots, choices, answer: choices.indexOf(String(n)) };
}

function giveTo(s: PotatoState, pid: PlayerId, now: number, rng: () => number): PotatoState {
  return { ...s, holder: pid, prompt: makePrompt(rng), lockedUntil: now };
}

/** Everything but the answer. */
function publicPrompt(p: Prompt) {
  const { answer: _a, ...rest } = p;
  return rest;
}
export type PublicPrompt = ReturnType<typeof publicPrompt>;

const nextAlive = (s: PotatoState) => s.alive[(s.alive.indexOf(s.holder) + 1) % s.alive.length];
const fuse = (now: number, rng: () => number) => now + 8000 + rng() * 9000;

export const hotPotato: MiniGameDefinition<PotatoState, { choice: number }> = {
  id: "hot-potato",
  kind: "turnBased",
  durationSec: 90,
  minPlayers: 2,
  inputSchema: z.object({ choice: z.number().int().min(0).max(2) }),
  init: ({ players, bonuses, now, rng }) => {
    const s: PotatoState = { players, bonuses, alive: [...players], out: [], holder: players[0], prompt: makePrompt(rng), explodeAt: fuse(now, rng), boomUntil: null, boomPlayer: null, boomRevive: false, revived: [], lockedUntil: now };
    return giveTo(s, players[Math.floor(rng() * players.length)], now, rng);
  },
  onInput: (s, pid, { choice }, { now, rng }) => {
    if (s.boomUntil || pid !== s.holder || now < s.lockedUntil) return s;
    if (choice === s.prompt.answer) return giveTo(s, nextAlive(s), now, rng);
    return { ...s, prompt: makePrompt(rng), lockedUntil: now + 600 }; // wrong: new prompt + short penalty
  },
  tick: (s, { now, rng }) => {
    if (s.boomUntil) {
      if (now >= s.boomUntil && s.alive.length > 1) return { ...giveTo({ ...s, boomUntil: null }, s.alive[Math.floor(rng() * s.alive.length)], now, rng), explodeAt: fuse(now, rng) };
      return s;
    }
    if (now >= s.explodeAt) {
      const victim = s.holder;
      // Bonus: the first explosion doesn't knock you out.
      if (s.bonuses.includes(victim) && !s.revived.includes(victim))
        return { ...s, revived: [...s.revived, victim], boomUntil: now + 2200, boomPlayer: victim, boomRevive: true };
      const idx = s.alive.indexOf(victim);
      const alive = s.alive.filter((p) => p !== victim);
      return { ...s, alive, out: [...s.out, victim], boomUntil: now + 2200, boomPlayer: victim, boomRevive: false, holder: alive[idx % Math.max(1, alive.length)] ?? victim };
    }
    return s;
  },
  isFinished: (s, now) => s.alive.length <= 1 && (!s.boomUntil || now >= s.boomUntil - 1000),
  results: (s) => {
    const out: Placement[] = s.alive.map((p) => ({ playerId: p, rank: 1, label: "Survived" }));
    [...s.out].reverse().forEach((p, i) => out.push({ playerId: p, rank: s.alive.length + i + 1, label: "Exploded" }));
    return out;
  },
  publicState: (s, now) => ({
    alive: s.alive,
    out: s.out,
    holder: s.holder,
    prompt: s.boomUntil ? null : publicPrompt(s.prompt),
    boom: s.boomUntil ? s.boomPlayer : null,
    revive: !!s.boomUntil && s.boomRevive,
    locked: now < s.lockedUntil,
    /** Players who still have their bonus revive. */
    extraLife: s.alive.filter((p) => s.bonuses.includes(p) && !s.revived.includes(p)),
  }),
};
