import { describe, expect, it } from "vitest";
import { itemDropWeight } from "../src/logic/items";
import { content } from "./helpers";

const item = (id: string) => content.items.find((i) => i.id === id)!;

describe("Item tile drop chances", () => {
  it("makes stronger (pricier) items rarer", () => {
    const cheap = itemDropWeight(item("wide-tolerance"), 4);
    const mid = itemDropWeight(item("swap-places"), 4);
    const warp = itemDropWeight(item("star-warp"), 4);
    const thief = itemDropWeight(item("star-thief"), 4);
    expect(cheap).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(warp);
    expect(warp).toBeGreaterThan(thief);
    expect(warp / cheap).toBeLessThan(0.1);
  });

  it("prices scaling items by the lobby size", () => {
    expect(itemDropWeight(item("coin-magnet"), 8)).toBeLessThan(itemDropWeight(item("coin-magnet"), 2));
  });
});
