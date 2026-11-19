import { describe, expect, it } from "vitest";
import { createRng, placeStar, starSafeZone, stepsFromStart } from "../src";
import { Harness, content } from "./helpers";

describe("star placement", () => {
  it("safe zone grows with the map size", () => {
    const zones = Object.fromEntries(content.boards.map((b) => [b.id, starSafeZone(b)]));
    expect(zones.heartbeat).toBe(3); // 25 tiles
    expect(zones["island-hopper"]).toBe(5); // 53 tiles
    for (const z of Object.values(zones)) expect(z).toBeGreaterThanOrEqual(2);
  });

  for (const board of content.boards) {
    it(`${board.id}: visits every allowed tile once (any type) before repeating, never near Start`, () => {
      const rng = createRng(7);
      const dist = stepsFromStart(board);
      const zone = starSafeZone(board);
      const allowed = board.tiles.filter((t) => t.id !== board.startTileId && dist.get(t.id)! > zone).map((t) => t.id);
      const game = { starTileId: "", starVisited: [] as string[] };
      const seen: string[] = [];
      for (let i = 0; i < allowed.length; i++) seen.push(placeStar(board, game, rng));
      expect(new Set(seen).size).toBe(allowed.length);
      expect([...seen].sort()).toEqual([...allowed].sort());
      // every tile type can host it (not just blue)
      const types = new Set(seen.map((id) => board.tiles.find((t) => t.id === id)!.type));
      expect(types.size).toBeGreaterThan(2);
      // history exhausted: starts over, but never stays on the same tile
      const last = game.starTileId;
      const again = placeStar(board, game, rng);
      expect(again).not.toBe(last);
      expect(allowed).toContain(again);
      expect(game.starVisited).toEqual([again]);
    });
  }

  it("a new game records the first star spot", () => {
    const h = new Harness(2);
    h.advanceTo("turnStart");
    expect(h.g.starVisited).toContain(h.g.starTileId);
  });
});
