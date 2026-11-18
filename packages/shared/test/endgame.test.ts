import { describe, expect, it } from "vitest";
import { bonusStarCount, computeAchievements, computeBonusStars, createRng, emptyStats, evaluateBonusStar } from "../src";
import { Harness, content } from "./helpers";

function withStats(h: Harness, patch: Record<string, Partial<ReturnType<typeof emptyStats>>>) {
  for (const [pid, s] of Object.entries(patch)) Object.assign(h.room.game!.players[pid].stats, s);
}

describe("bonus stars", () => {
  const def = (id: string) => content.bonusStars.find((b) => b.id === id)!;

  it("Sharpshooter goes to the best match rate, needing 3+ guesses", () => {
    const h = new Harness(3);
    withStats(h, {
      p1: { guesses: 10, matchesMade: 7 }, // 70%
      p2: { guesses: 4, matchesMade: 3 }, // 75%: best
      p3: { guesses: 2, matchesMade: 2 }, // 100% but too few guesses
    });
    const sharp = evaluateBonusStar(h.g, def("sharpshooter"));
    expect(sharp.playerIds).toEqual(["p2"]);
    expect(sharp.value).toBe(0.75);
  });

  it("equal rates tie and both win", () => {
    const h = new Harness(2);
    withStats(h, { p1: { guesses: 3, matchesMade: 2 }, p2: { guesses: 6, matchesMade: 4 } });
    expect(evaluateBonusStar(h.g, def("sharpshooter")).playerIds.sort()).toEqual(["p1", "p2"]);
  });

  it("nobody gets a rate award when nobody qualifies", () => {
    const h = new Harness(2);
    expect(evaluateBonusStar(h.g, def("sharpshooter")).playerIds).toEqual([]);
  });

  it("draws won categories at random; more players, more stars", () => {
    expect([2, 3, 4, 5, 6, 7, 8].map(bonusStarCount)).toEqual([2, 3, 3, 4, 4, 5, 5]);
    const h = new Harness(4);
    withStats(h, {
      p1: { guesses: 4, matchesMade: 3, stepsMoved: 30, steals: 2 },
      p2: { minigameWins: 3, minigamesPlayed: 4, coinsEarned: 50 },
      p3: { itemsUsed: 4, perfectMatches: 1 },
    });
    const seen = new Set<string>();
    for (let seed = 1; seed < 30; seed++) {
      const awards = computeBonusStars(h.g, content, createRng(seed));
      expect(awards).toHaveLength(bonusStarCount(4));
      expect(awards.every((a) => a.playerIds.length > 0)).toBe(true);
      for (const a of awards) seen.add(a.bonusStarId);
    }
    expect(seen.size).toBeGreaterThan(bonusStarCount(4)); // not always the same ones
  });
});

describe("achievements", () => {
  it("awards badges from stats", () => {
    const h = new Harness(3);
    withStats(h, {
      p1: { guesses: 4, matchesMade: 3, perfectMatches: 2, steals: 1, stepsMoved: 40 },
      p2: { timesTarget: 2, matchedAsTarget: 0, stepsMoved: 10, minigamesPlayed: 2, minigameWins: 2 },
    });
    const a = computeAchievements(h.g);
    expect(a.p1).toEqual(expect.arrayContaining(["mind-meld", "bullseye", "pickpocket", "globetrotter"]));
    expect(a.p2).toEqual(expect.arrayContaining(["poker-face", "flawless"]));
    expect(a.p3).not.toContain("globetrotter");
  });
});
