import { describe, expect, it } from "vitest";
import { COMEBACK_EFFECTS, GAME_CONFIG, createRng, resolveQuestion, shopStock, updateSettings } from "../src";
import { content, makeRoom } from "./helpers";

describe("Party Board tweaks", () => {
  it("the shop always stocks a way to a star (Star Thief, Swap Places or Star Warp)", () => {
    const comeback = new Set(content.items.filter((i) => COMEBACK_EFFECTS.includes(i.effect)).map((i) => i.id));
    expect(comeback.size).toBe(3);
    for (let seed = 1; seed <= 300; seed++) {
      const stock = shopStock(content, { ctx: { rng: createRng(seed) } as never, events: [] });
      expect(stock).toHaveLength(GAME_CONFIG.economy.shopStockSize);
      expect(new Set(stock).size).toBe(stock.length);
      expect(stock.some((id) => comeback.has(id)), `seed ${seed}: ${stock}`).toBe(true);
    }
  });

  it("questions never offer more than 4 answers, whatever the player count", () => {
    const players = ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8"];
    const names = Object.fromEntries(players.map((p) => [p, p]));
    for (const pack of content.packs)
      for (const q of pack.questions) {
        if (q.format !== "player" && (q.format !== "tiles" || !q.answers)) continue;
        const r = resolveQuestion(q, pack, { targetId: "p1", names, participants: players, rng: createRng(5), language: "en" });
        const n = q.format === "player" ? r.playerChoices!.length : r.options!.length;
        expect(n, q.id).toBeLessThanOrEqual(4);
        expect(n, q.id).toBeGreaterThanOrEqual(2);
      }
  });

  it("offers a 5-round game", () => {
    const room = updateSettings(makeRoom(3), { turnCount: 5 }, content);
    expect(room.settings.turnCount).toBe(5);
  });
});

describe("joining a running game", () => {
  it("Party Board: a late joiner gets a seat at the end with average coins", async () => {
    const { Harness } = await import("./helpers");
    const { addPlayer, addPlayerToGame } = await import("../src");
    const h = new Harness(3);
    h.room.game!.players.p1.coins = 30;
    h.room.game!.players.p2.coins = 6;
    h.room.game!.players.p3.coins = 0;
    h.room = addPlayer(h.room, { id: "late", name: "Late", now: h.now });
    h.room = addPlayerToGame(h.room, "late", h.ctx()).room;
    const p = h.g.players.late;
    expect(h.g.order[h.g.order.length - 1]).toBe("late");
    expect(p.coins).toBe(12);
    expect(p.stars).toBe(0);
    // Adding twice changes nothing.
    h.room = addPlayerToGame(h.room, "late", h.ctx()).room;
    expect(h.g.order.filter((x) => x === "late")).toHaveLength(1);
    // The game plays on with them.
    for (let i = 0; i < 400 && h.g.phase !== "podium"; i++) h.timeout();
  });
});
