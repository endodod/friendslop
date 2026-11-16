import type { Step } from "../engine/context";
import { emit } from "../engine/context";
import type { GameState, PlayerId } from "../engine/types";

/** Change coins (never below 0). Returns the actual delta applied. */
export function changeCoins(g: GameState, s: Step, playerId: PlayerId, delta: number, reason: string): number {
  const p = g.players[playerId];
  if (!p || delta === 0) return 0;
  const before = p.coins;
  p.coins = Math.max(0, p.coins + delta);
  const actual = p.coins - before;
  if (actual > 0) p.stats.coinsEarned += actual;
  if (actual < 0) p.stats.coinsLost += -actual;
  if (actual !== 0) emit(s, { type: "coinsChanged", playerId, delta: actual, reason });
  return actual;
}

/** Move up to `amount` coins from one player to another. Returns the amount moved. */
export function transferCoins(g: GameState, s: Step, from: PlayerId, to: PlayerId, amount: number, reason: string): number {
  const taken = -changeCoins(g, s, from, -amount, reason);
  changeCoins(g, s, to, taken, reason);
  return taken;
}

export function changeStars(g: GameState, s: Step, playerId: PlayerId, delta: number, reason: string) {
  const p = g.players[playerId];
  if (!p) return;
  p.stars = Math.max(0, p.stars + delta);
  emit(s, { type: "starsChanged", playerId, delta, reason });
}

/** Ranking: stars desc, then coins desc. Returns players with shared rank on full ties. */
export function standings(g: GameState): { playerId: PlayerId; rank: number }[] {
  const sorted = Object.values(g.players).sort((a, b) => b.stars - a.stars || b.coins - a.coins);
  let rank = 0;
  return sorted.map((p, i) => {
    const prev = sorted[i - 1];
    if (!prev || prev.stars !== p.stars || prev.coins !== p.coins) rank = i + 1;
    return { playerId: p.id, rank };
  });
}

/** Placement → coins table, scaled by participant count. Ties share the better placement. */
export function placementCoins(table: Record<number, number[]>, participants: number, rank: number): number {
  const row = table[participants] ?? table[4];
  return row[Math.min(rank - 1, row.length - 1)] ?? 0;
}
