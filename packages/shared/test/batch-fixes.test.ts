import { describe, expect, it } from "vitest";
import { GAME_CONFIG, itemPrice, sanitizeChat } from "../src";
import { Harness, content } from "./helpers";

describe("coin magnet price", () => {
  it("scales with the number of other players", () => {
    const magnet = content.items.find((i) => i.id === "coin-magnet")!;
    expect(itemPrice(magnet, 2)).toBe(4);
    expect(itemPrice(magnet, 4)).toBe(8);
    expect(itemPrice(magnet, 8)).toBe(16);
    const other = content.items.find((i) => i.id !== "coin-magnet")!;
    expect(itemPrice(other, 8)).toBe(other.price);
  });
});

describe("chat text", () => {
  it("trims, collapses whitespace, strips control characters and caps length", () => {
    expect(sanitizeChat("  hi \n\n there\u0007 ")).toBe("hi there");
    expect(sanitizeChat("   ")).toBe("");
    expect(sanitizeChat("x".repeat(500))).toHaveLength(200);
  });
});

describe("bonus stars", () => {
  it("hold on the final standings before the results page; the host can skip", () => {
    const h = new Harness(2, { seed: 8 });
    h.room.game!.players.p1.stats.stepsMoved = 12;
    h.act({ type: "finish" }, true);
    h.advanceTo("bonusStars");
    while (h.g.bonusStars!.revealed < h.g.bonusStars!.awards.length) h.timeout();
    expect(h.g.phase).toBe("bonusStars");
    expect(h.g.phaseEndsAt! - h.now).toBe(GAME_CONFIG.timers.bonusStarsHoldMs);
    h.now += 2000;
    h.act({ type: "continue" }, true);
    expect(h.g.phase).toBe("podium");
  });
});
