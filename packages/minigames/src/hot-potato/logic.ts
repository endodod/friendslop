import { z } from "zod";
import { shuffle, type MiniGameDefinition, type Placement, type PlayerId } from "@party-game/shared";

export interface Prompt { text: string; choices: number[]; answer: number }

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
  const a = 2 + Math.floor(rng() * 12);
  const b = 2 + Math.floor(rng() * 12);
  const answer = a + b;
  const wrong = new Set<number>();
  while (wrong.size < 2) {
    const w = answer + (Math.floor(rng() * 7) - 3 || 4);
    if (w !== answer) wrong.add(w);
  }
  return { text: `${a} + ${b}`, answer, choices: shuffle(rng, [answer, ...wrong]) };
}

function giveTo(s: PotatoState, pid: PlayerId, now: number, rng: () => number): PotatoState {
  return { ...s, holder: pid, prompt: makePrompt(rng), lockedUntil: now };
}

const nextAlive = (s: PotatoState) => s.alive[(s.alive.indexOf(s.holder) + 1) % s.alive.length];
const fuse = (now: number, rng: () => number) => now + 8000 + rng() * 9000;

export const hotPotato: MiniGameDefinition<PotatoState, { choice: number }> = {
  id: "hot-potato",
  kind: "turnBased",
  durationSec: 90,
  minPlayers: 2,
  inputSchema: z.object({ choice: z.number().int().min(-1000).max(1000) }),
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
    prompt: s.boomUntil ? null : { text: s.prompt.text, choices: s.prompt.choices },
    boom: s.boomUntil ? s.boomPlayer : null,
    revive: !!s.boomUntil && s.boomRevive,
    locked: now < s.lockedUntil,
    /** Players who still have their bonus revive. */
    extraLife: s.alive.filter((p) => s.bonuses.includes(p) && !s.revived.includes(p)),
  }),
};
