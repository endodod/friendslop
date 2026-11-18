import { describe, expect, it } from "vitest";
import { computeAchievements, computeBonusStars, createRng, emptyStats } from "../src";
import { Harness, content } from "./helpers";

function withStats(h: Harness, patch: Record<string, Partial<ReturnType<typeof emptyStats>>>) {
  for (const [pid, s] of Object.entries(patch)) Object.assign(h.room.game!.players[pid].stats, s);
}

describe("bonus stars", () => {
  it("always awards Sharpshooter for the best match rate, needing 3+ guesses", () => {
    const h = new Harness(3);
    withStats(h, {
      p1: { guesses: 10, matchesMade: 7 }, // 70%
      p2: { guesses: 4, matchesMade: 3 }, // 75%: best
      p3: { guesses: 2, matchesMade: 2 }, // 100% but too few guesses
    });
    for (let seed = 1; seed < 20; seed++) {
      const awards = computeBonusStars(h.g, content, createRng(seed));
      const sharp = awards.find((a) => a.bonusStarId === "sharpshooter");
      expect(sharp).toBeDefined();
      expect(sharp!.playerIds).toEqual(["p2"]);
      expect(sharp!.value).toBe(0.75);
      expect(awards.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("equal rates tie and both win", () => {
    const h = new Harness(2);
    withStats(h, { p1: { guesses: 3, matchesMade: 2 }, p2: { guesses: 6, matchesMade: 4 } });
    const sharp = computeBonusStars(h.g, content, createRng(1)).find((a) => a.bonusStarId === "sharpshooter")!;
    expect(sharp.playerIds.sort()).toEqual(["p1", "p2"]);
  });

  it("nobody gets a rate award when nobody qualifies", () => {
    const h = new Harness(2);
    const sharp = computeBonusStars(h.g, content, createRng(1)).find((a) => a.bonusStarId === "sharpshooter")!;
    expect(sharp.playerIds).toEqual([]);
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
