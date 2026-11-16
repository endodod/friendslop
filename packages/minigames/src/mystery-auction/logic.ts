import { z } from "zod";
import { rankByScore, type MiniGameDefinition, type PlayerId } from "@party-game/shared";

export const BOXES = 3;
export const BID_MS = 20000;
export const REVEAL_MS = 6000;
const CONTENTS = [-6, -3, 0, 4, 7, 10, 14, 18];

export interface AuctionState {
  players: PlayerId[];
  bonuses: PlayerId[];
  /** Secret until reveal. */
  contents: number[];
  /** Which box each bonus player may peek into. */
  peek: Record<PlayerId, number>;
  wallet: Record<PlayerId, number>;
  bids: Record<PlayerId, number[]>;
  locked: PlayerId[];
  endsAt: number;
  revealUntil: number | null;
  winners: (PlayerId | null)[];
}

/** Highest bid wins; ties go to whoever locked in first. Zero bids never win. */
export function resolve(s: AuctionState): (PlayerId | null)[] {
  return Array.from({ length: BOXES }, (_, box) => {
    let best: PlayerId | null = null;
    for (const pid of s.locked.concat(s.players.filter((p) => !s.locked.includes(p)))) {
      const bid = s.bids[pid]?.[box] ?? 0;
      if (bid > 0 && (best === null || bid > (s.bids[best]?.[box] ?? 0))) best = pid;
    }
    return best;
  });
}

export function net(s: AuctionState, pid: PlayerId): number {
  return s.winners.reduce((sum, w, box) => (w === pid ? sum + s.contents[box] - (s.bids[pid]?.[box] ?? 0) : sum), 0);
}

export const mysteryAuction: MiniGameDefinition<AuctionState, { bids: number[] }> = {
  id: "mystery-auction",
  kind: "turnBased",
  durationSec: 35,
  minPlayers: 2,
  inputSchema: z.object({ bids: z.array(z.number().int().min(0).max(999)).length(BOXES) }),
  init: ({ players, bonuses, now, rng, services }) => ({
    players,
    bonuses,
    contents: Array.from({ length: BOXES }, () => CONTENTS[Math.floor(rng() * CONTENTS.length)]),
    peek: Object.fromEntries(bonuses.map((b) => [b, Math.floor(rng() * BOXES)])),
    wallet: Object.fromEntries(players.map((p) => [p, services.coins?.[p] ?? 0])),
    bids: {},
    locked: [],
    endsAt: now + BID_MS,
    revealUntil: null,
    winners: [],
  }),
  onInput: (s, pid, { bids }) => {
    if (s.revealUntil || s.locked.includes(pid)) return s;
    // Total bids can't exceed your coins.
    if (bids.reduce((a, b) => a + b, 0) > (s.wallet[pid] ?? 0)) return s;
    return { ...s, bids: { ...s.bids, [pid]: bids }, locked: [...s.locked, pid] };
  },
  tick: (s, { now }) => {
    if (s.revealUntil) return s;
    if (now >= s.endsAt || s.players.every((p) => s.locked.includes(p))) {
      const next = { ...s, revealUntil: now + REVEAL_MS };
      return { ...next, winners: resolve(next) };
    }
    return s;
  },
  isFinished: (s, now) => s.revealUntil !== null && now >= s.revealUntil,
  results: (s) => rankByScore(s.players, Object.fromEntries(s.players.map((p) => [p, net(s, p)])), true, (n) => (n >= 0 ? `+${n}` : `${n}`)),
  payout: (s) => Object.fromEntries(s.players.map((p) => [p, net(s, p)])),
  publicState: (s) => ({
    endsAt: s.endsAt,
    locked: s.locked,
    revealed: s.revealUntil !== null,
    contents: s.revealUntil ? s.contents : null,
    bids: s.revealUntil ? s.bids : null,
    winners: s.revealUntil ? s.winners : null,
  }),
  privateState: (s, pid) => ({
    wallet: s.wallet[pid] ?? 0,
    myBids: s.bids[pid] ?? null,
    peek: s.peek[pid] !== undefined ? { box: s.peek[pid], value: s.contents[s.peek[pid]] } : null,
  }),
};
