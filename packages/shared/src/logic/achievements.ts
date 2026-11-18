import type { GameState, PlayerId, PlayerStats } from "../engine/types";
import { standings } from "./economy";

/**
 * End-of-game achievements: badges for the finished-game page. They give no stars (bonus stars
 * do that); they're bragging rights. Everything is computed from public stats, so the client can
 * show them without extra server state.
 */
export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  /** Badge colour. */
  color: string;
}

interface Ctx {
  stats: PlayerStats;
  all: PlayerStats[];
  rank: number;
  players: number;
  stars: number;
  coins: number;
  items: number;
}

const rate = (a: number, b: number) => (b > 0 ? a / b : 0);
const isTop = (c: Ctx, f: (s: PlayerStats) => number) => {
  const v = f(c.stats);
  return v > 0 && c.all.every((o) => f(o) <= v);
};

const DEFS: (AchievementDef & { test: (c: Ctx) => boolean })[] = [
  { id: "mind-meld", name: "Mind Meld", description: "Matched at least 75% of your guesses (4+ guesses).", icon: "mind", color: "#b26bff", test: (c) => c.stats.guesses >= 4 && rate(c.stats.matchesMade, c.stats.guesses) >= 0.75 },
  { id: "bullseye", name: "Bullseye", description: "Two or more perfect number guesses.", icon: "perfect", color: "#ffc933", test: (c) => c.stats.perfectMatches >= 2 },
  { id: "easy-read", name: "Easy Read", description: "Others matched you 4+ times as the target.", icon: "open-book", color: "#2fd6d0", test: (c) => c.stats.matchedAsTarget >= 4 },
  { id: "poker-face", name: "Poker Face", description: "Target twice or more, and nobody ever read you.", icon: "enigma", color: "#6a6a8a", test: (c) => c.stats.timesTarget >= 2 && c.stats.matchedAsTarget === 0 },
  { id: "champion", name: "Champion", description: "Won 3 or more mini-games.", icon: "trophy", color: "#ffc933", test: (c) => c.stats.minigameWins >= 3 },
  { id: "flawless", name: "Flawless", description: "Won every mini-game you played (2+).", icon: "crown", color: "#ffe066", test: (c) => c.stats.minigamesPlayed >= 2 && c.stats.minigameWins === c.stats.minigamesPlayed },
  { id: "pickpocket", name: "Pickpocket", description: "Stole from another player.", icon: "steal", color: "#ff8a3d", test: (c) => c.stats.steals >= 1 },
  { id: "robbed", name: "Robbed Blind", description: "Got stolen from twice or more.", icon: "coin-loss", color: "#ff4d5e", test: (c) => c.stats.stolenFrom >= 2 },
  { id: "star-collector", name: "Star Collector", description: "Bought 2 or more stars.", icon: "star", color: "#ffe066", test: (c) => c.stats.starsBought >= 2 },
  { id: "gadgeteer", name: "Gadgeteer", description: "Used 3 or more items.", icon: "backpack", color: "#ff6bc6", test: (c) => c.stats.itemsUsed >= 3 },
  { id: "hoarder", name: "Hoarder", description: "Ended the game holding 3+ items.", icon: "shop", color: "#2fd27a", test: (c) => c.items >= 3 },
  { id: "bad-luck", name: "Bad Luck Magnet", description: "Landed on 4 or more red tiles.", icon: "skull", color: "#ff4d5e", test: (c) => c.stats.redTiles >= 4 },
  { id: "globetrotter", name: "Globetrotter", description: "Walked the most spaces.", icon: "footprints", color: "#3d8bff", test: (c) => isTop(c, (s) => s.stepsMoved) },
  { id: "moneybags", name: "Moneybags", description: "Earned the most coins.", icon: "coins", color: "#ffc933", test: (c) => isTop(c, (s) => s.coinsEarned) },
  { id: "self-aware", name: "Self-Aware", description: "Right about your own data twice or more.", icon: "data", color: "#38bdf8", test: (c) => c.stats.dataSelfCorrect >= 2 },
  { id: "underdog", name: "Underdog", description: "Finished last but still won a mini-game.", icon: "lightning", color: "#94a3b8", test: (c) => c.players > 2 && c.rank === c.players && c.stats.minigameWins >= 1 },
  { id: "starless", name: "Starless Wonder", description: "Finished in the top half without buying a single star.", icon: "star-fly", color: "#a29cc6", test: (c) => c.stats.starsBought === 0 && c.rank <= Math.ceil(c.players / 2) && c.players > 2 },
];

export const ACHIEVEMENTS: AchievementDef[] = DEFS.map(({ test: _t, ...d }) => d);

/** Achievement ids each player earned this game. */
export function computeAchievements(
  g: Pick<GameState, "players" | "order"> & { players: Record<PlayerId, { stats: PlayerStats; stars: number; coins: number; items?: string[]; itemCount?: number }> },
): Record<PlayerId, string[]> {
  const ids = Object.keys(g.players);
  const all = ids.map((id) => g.players[id].stats);
  const ranks = new Map(standings(g as never).map((s) => [s.playerId, s.rank]));
  return Object.fromEntries(
    ids.map((id) => {
      const p = g.players[id];
      const ctx: Ctx = {
        stats: p.stats,
        all,
        rank: ranks.get(id) ?? ids.length,
        players: ids.length,
        stars: p.stars,
        coins: p.coins,
        items: p.items?.length ?? p.itemCount ?? 0,
      };
      return [id, DEFS.filter((d) => d.test(ctx)).map((d) => d.id)];
    }),
  );
}

/** Question match rate as a 0..1 number (null when the player never guessed). */
export function matchRate(s: PlayerStats): number | null {
  return s.guesses > 0 ? s.matchesMade / s.guesses : null;
}
