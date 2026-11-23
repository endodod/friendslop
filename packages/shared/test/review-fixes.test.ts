import { describe, expect, it } from "vitest";
import { PLAYER_AVATARS, removePlayerFromGame } from "../src";
import { Harness } from "./helpers";

const totalStars = (h: Harness) => Object.values(h.g.players).reduce((a, p) => a + p.stars, 0);

describe("review fixes", () => {
  it("the star is not a player icon (it's the scoring currency)", () => {
    expect(PLAYER_AVATARS as readonly string[]).not.toContain("⭐");
  });

  it("finishing again during the bonus stars doesn't hand them out twice", () => {
    const h = new Harness(3);
    h.advanceTo("turnStart");
    for (const p of Object.values(h.room.game!.players)) {
      const lead = p.id === "p1";
      p.stats.stepsMoved = lead ? 10 : 1;
      p.stats.coinsEarned = lead ? 50 : 1;
      p.stats.blueTiles = lead ? 5 : 0;
    }
    h.act({ type: "finish" }, true);
    h.advanceTo("bonusStars");
    h.advanceTo("podium");
    const awarded = totalStars(h);
    expect(awarded).toBeGreaterThan(0);
    // Same game, but the host taps Finish while the stars are being revealed.
    const h2 = new Harness(3);
    h2.advanceTo("turnStart");
    for (const p of Object.values(h2.room.game!.players)) Object.assign(p.stats, h.g.players[p.id].stats);
    h2.act({ type: "finish" }, true);
    h2.advanceTo("bonusStars");
    h2.timeout();
    h2.now += 5000;
    expect(() => h2.act({ type: "finish" }, true)).toThrow();
    h2.advanceTo("podium");
    expect(totalStars(h2)).toBe(h2.g.bonusStars!.awards.reduce((a, x) => a + x.playerIds.length, 0));
  });

  it("removing the active player while they pick a duel opponent doesn't skip the next player", () => {
    const h = new Harness(4);
    h.advanceTo("turnStart");
    const [a, b] = h.g.order;
    h.room.game!.phase = "duel";
    h.room.game!.duel = { challengerId: a, opponentId: null };
    h.room = removePlayerFromGame(h.room, a, h.ctx()).room;
    expect(h.g.phase).toBe("turnEnd");
    h.timeout();
    expect(h.active()).toBe(b);
  });

  it("removing the target of a mini-game's intro question also drops them from the mini-game", () => {
    const h = new Harness(4);
    h.advanceTo("turnStart");
    const g = h.room.game!;
    g.phase = "minigameQuestion";
    g.minigame = {
      id: "x", kind: "realtime", origin: "round", participants: [...g.order], bonuses: [], seed: 1,
      startedAt: 0, endsAt: 0, state: null, placements: null, payout: null, introTargetId: g.order[1],
    } as never;
    g.question = { targetId: g.order[1], participants: [...g.order], stage: "answering", answers: {}, revealOrder: [] } as never;
    const gone = g.order[1];
    h.room = removePlayerFromGame(h.room, gone, h.ctx()).room;
    expect(h.g.phase).toBe("minigameCountdown");
    expect(h.g.minigame!.participants).not.toContain(gone);
  });

  it("walking past the star without enough coins doesn't stop you", () => {
    const h = new Harness(2);
    h.advanceTo("turnStart");
    const g = h.room.game!;
    const pid = h.active();
    g.players[pid].coins = 0;
    // Put the star on the very next tile and roll a big number.
    const board = h.ctx().content.boards.find((b) => b.id === g.boardId)!;
    const tile = board.tiles.find((t) => t.id === g.players[pid].tileId)!;
    g.starTileId = tile.next[0];
    h.act({ type: "roll", playerId: pid, value: 6 });
    h.timeout(); // rolling → moving
    expect(h.g.phase).not.toBe("starPurchase");
    expect(h.g.movement!.next).not.toBe("starPass");
  });
});
