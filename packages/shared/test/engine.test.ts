import { describe, expect, it } from "vitest";
import { GAME_CONFIG, tickGame, toPrivateState, toPublicState, updatePlayer, onConnectionChange } from "../src";
import { Harness } from "./helpers";

/** Give the active player an item and roll a fixed value with Custom Dice. */
function rollExactly(h: Harness, n: number) {
  const pid = h.active();
  h.room.game!.players[pid].items.push("custom-dice");
  h.act({ type: "useItem", playerId: pid, itemId: "custom-dice" });
  h.act({ type: "roll", playerId: pid, value: n });
  expect(h.g.phase).toBe("rolling");
  expect(h.g.dice!.total).toBe(n);
  h.timeout(); // rolling → moving
}

function toTurnStart(h: Harness) {
  h.advanceTo("turnStart");
}

describe("turn flow & movement", () => {
  it("blue tile: +3 coins", () => {
    const h = new Harness(2);
    toTurnStart(h);
    const pid = h.active();
    rollExactly(h, 1);
    expect(h.g.phase).toBe("moving");
    expect(h.g.players[pid].tileId).toBe("m1");
    h.timeout();
    expect(h.g.phase).toBe("tileEffect");
    expect(h.g.players[pid].coins).toBe(13);
    expect(h.events.some((e) => e.type === "tokenMoved" && e.path.join() === "m1")).toBe(true);
  });

  it("red tile: −3 coins, never below 0", () => {
    const h = new Harness(2);
    toTurnStart(h);
    const pid = h.active();
    h.room.game!.players[pid].tileId = "m3";
    h.room.game!.players[pid].coins = 1;
    h.room.game!.starTileId = "m20";
    rollExactly(h, 1);
    h.timeout();
    expect(h.g.players[pid].tileId).toBe("m4");
    expect(h.g.players[pid].coins).toBe(0);
    expect(h.g.players[pid].stats.redTiles).toBe(1);
  });

  it("junction: player picks a path, the rest of the roll follows it", () => {
    const h = new Harness(2);
    toTurnStart(h);
    const pid = h.active();
    h.room.game!.players[pid].tileId = "m4";
    h.room.game!.starTileId = "m20";
    rollExactly(h, 3);
    expect(h.g.players[pid].tileId).toBe("m5");
    h.timeout();
    expect(h.g.phase).toBe("junctionChoice");
    expect(h.g.junction!.options.sort()).toEqual(["a0", "m6"]);
    expect(() => h.act({ type: "chooseDirection", playerId: pid, tileId: "m9" })).toThrow();
    h.act({ type: "chooseDirection", playerId: pid, tileId: "a0" });
    expect(h.g.players[pid].tileId).toBe("a1");
    expect(h.g.movement!.path).toEqual(["a0", "a1"]);
  });

  it("junction times out to a random valid path", () => {
    const h = new Harness(2);
    toTurnStart(h);
    const pid = h.active();
    h.room.game!.players[pid].tileId = "m5";
    h.room.game!.starTileId = "m20";
    rollExactly(h, 2);
    expect(h.g.phase).toBe("junctionChoice");
    h.timeout();
    expect(["m7", "a1"]).toContain(h.g.players[pid].tileId);
  });

  it("passing the star offers it, then movement continues", () => {
    const h = new Harness(2);
    toTurnStart(h);
    const pid = h.active();
    h.room.game!.starTileId = "m2";
    h.room.game!.players[pid].coins = 25;
    rollExactly(h, 3);
    expect(h.g.players[pid].tileId).toBe("m2");
    h.timeout();
    expect(h.g.phase).toBe("starPurchase");
    expect(h.g.star!.passing).toBe(true);
    h.act({ type: "starBuy", playerId: pid, buy: true });
    expect(h.g.players[pid].stars).toBe(1);
    expect(h.g.players[pid].coins).toBe(5);
    expect(h.g.starTileId).not.toBe("m2");
    expect(h.g.phase).toBe("moving");
    expect(h.g.players[pid].tileId).toBe("m3");
  });

  it("star race: reaching the star goal ends the game right away, no bonus stars", () => {
    const h = new Harness(3);
    h.room = { ...h.room, settings: { ...h.room.settings, starGoal: 3 } };
    toTurnStart(h);
    const pid = h.active();
    h.room.game!.starTileId = "m1";
    h.room.game!.players[pid].stars = 2;
    h.room.game!.players[pid].coins = 30;
    rollExactly(h, 1);
    h.timeout();
    h.act({ type: "starBuy", playerId: pid, buy: true });
    expect(h.g.phase).toBe("gameEnd");
    expect(h.g.starGoalWinner).toBe(pid);
    h.timeout();
    expect(h.g.phase).toBe("podium");
    expect(h.g.bonusStars).toBeNull();
    expect(h.g.finalRanking![0]).toBe(pid);
  });

  it("without a star goal the game keeps going", () => {
    const h = new Harness(2);
    toTurnStart(h);
    const pid = h.active();
    h.room.game!.starTileId = "m1";
    h.room.game!.players[pid].stars = 4;
    h.room.game!.players[pid].coins = 30;
    rollExactly(h, 1);
    h.timeout();
    h.act({ type: "starBuy", playerId: pid, buy: true });
    expect(h.g.phase).toBe("turnEnd");
  });

  it("landing on the star without enough coins: nothing bought", () => {
    const h = new Harness(2);
    toTurnStart(h);
    const pid = h.active();
    h.room.game!.starTileId = "m1";
    rollExactly(h, 1);
    h.timeout();
    expect(h.g.phase).toBe("starPurchase");
    h.timeout();
    expect(h.g.players[pid].stars).toBe(0);
    expect(h.g.phase).toBe("turnEnd");
  });

  it("only the active player can roll", () => {
    const h = new Harness(3);
    toTurnStart(h);
    const other = h.g.order.find((p) => p !== h.active())!;
    expect(() => h.act({ type: "roll", playerId: other })).toThrow(/not your turn/);
  });

  it("double dice rolls two dice", () => {
    const h = new Harness(2);
    toTurnStart(h);
    const pid = h.active();
    h.room.game!.players[pid].items.push("double-dice");
    h.act({ type: "useItem", playerId: pid, itemId: "double-dice" });
    h.act({ type: "roll", playerId: pid });
    expect(h.g.dice!.values).toHaveLength(2);
    expect(h.g.dice!.total).toBe(h.g.dice!.values[0] + h.g.dice!.values[1]);
    expect(h.g.players[pid].items).not.toContain("double-dice");
  });

  it("disconnected player's turn auto-plays after a timeout", () => {
    const h = new Harness(2);
    toTurnStart(h);
    const pid = h.active();
    h.room = updatePlayer(h.room, pid, { connected: false, disconnectedAt: h.now });
    h.now += GAME_CONFIG.timers.disconnectedAutoplayMs + 1;
    const res = tickGame(h.room, h.ctx())!;
    expect(res.room.game!.phase).toBe("rolling");
  });
});

describe("question tiles", () => {
  it("question round with the landing player as target, scoring applied at results", () => {
    const h = new Harness(3);
    toTurnStart(h);
    const pid = h.active();
    h.room.game!.tileTypes["m1"] = "question";
    h.room.game!.starTileId = "m20";
    rollExactly(h, 1);
    h.timeout();
    expect(h.g.phase).toBe("questionRound");
    const q = h.g.question!;
    expect(q.targetId).toBe(pid);
    expect(q.stage).toBe("intro");
    h.timeout();
    expect(h.g.question!.stage).toBe("answering");
    const fmt = q.question.format;
    const answerFor = () => {
      const qq = h.g.question!.question;
      if (fmt === "tiles") return { kind: "option" as const, optionId: qq.options![0].id };
      if (fmt === "number" || fmt === "scale") return { kind: "number" as const, value: qq.number!.min };
      if (fmt === "player") return { kind: "player" as const, playerId: qq.playerChoices![0] };
      if (fmt === "higherLower") return { kind: "hl" as const, dir: "higher" as const };
      return { kind: "order" as const, optionIds: qq.options!.map((o) => o.id) };
    };
    const coinsBefore = Object.fromEntries(h.g.order.map((p) => [p, h.g.players[p].coins]));
    for (const p of h.g.order) h.act({ type: "answer", playerId: p, answer: answerFor() });
    expect(h.g.question!.stage).toBe("reveal"); // everyone answered → reveal early
    h.timeout();
    expect(h.g.question!.stage).toBe("results");
    const others = h.g.order.filter((p) => p !== pid);
    for (const p of others) expect(h.g.players[p].coins).toBe(coinsBefore[p] + 3 + (fmt === "number" || fmt === "scale" ? 2 : 0));
    expect(h.g.players[pid].coins).toBe(coinsBefore[pid] + 2 * others.length);
    expect(h.g.players[pid].stats.matchedAsTarget).toBe(2);
    h.timeout();
    expect(h.g.phase).toBe("turnEnd");
  });

  it("rejects late, duplicate and malformed answers", () => {
    const h = new Harness(2, { mode: "questionDebug" });
    h.timeout(); // → question intro
    const p = h.g.order[0];
    expect(() => h.act({ type: "answer", playerId: p, answer: { kind: "number", value: 1 } })).toThrow(/closed/);
    h.timeout(); // answering
    expect(() => h.act({ type: "answer", playerId: p, answer: { kind: "option", optionId: "nope" } })).toThrow();
  });

  it("never leaks answers before the reveal", () => {
    const h = new Harness(3, { mode: "questionDebug" });
    h.timeout();
    h.timeout();
    const [a, b] = h.g.order;
    const q = h.g.question!.question;
    const ans =
      q.format === "tiles"
        ? { kind: "option" as const, optionId: q.options![1].id }
        : q.format === "player"
          ? { kind: "player" as const, playerId: q.playerChoices![1] }
          : q.format === "higherLower"
            ? { kind: "hl" as const, dir: "lower" as const }
            : q.format === "ranking"
              ? { kind: "order" as const, optionIds: q.options!.map((o) => o.id) }
              : { kind: "number" as const, value: q.number!.min };
    h.act({ type: "answer", playerId: a, answer: ans });
    const pub = JSON.stringify(toPublicState(h.room, {}, h.now));
    expect(pub).not.toContain(JSON.stringify(ans));
    expect(toPublicState(h.room, {}, h.now).game!.question!.answers).toBeNull();
    expect(toPublicState(h.room, {}, h.now).game!.question!.answered).toEqual([a]);
    expect(toPrivateState(h.room, a, {}, h.now).myAnswer).toEqual(ans);
    expect(toPrivateState(h.room, b, {}, h.now).myAnswer).toBeNull();
  });

  it("answering ends early when the only missing player disconnects", () => {
    const h = new Harness(3, { mode: "questionDebug" });
    h.timeout();
    h.timeout();
    const [a, b, c] = h.g.order;
    const q = h.g.question!.question;
    const ans =
      q.format === "tiles" ? { kind: "option" as const, optionId: q.options![0].id }
      : q.format === "player" ? { kind: "player" as const, playerId: q.playerChoices![0] }
      : q.format === "higherLower" ? { kind: "hl" as const, dir: "lower" as const }
      : q.format === "ranking" ? { kind: "order" as const, optionIds: q.options!.map((o) => o.id) }
      : { kind: "number" as const, value: q.number!.min };
    h.act({ type: "answer", playerId: a, answer: ans });
    h.act({ type: "answer", playerId: b, answer: ans });
    h.room = updatePlayer(h.room, c, { connected: false, disconnectedAt: h.now });
    const res = onConnectionChange(h.room, h.ctx())!;
    expect(res.room.game!.question!.stage).toBe("reveal");
  });
});

describe("items", () => {
  it("steal takes 5 coins; a shield blocks it and is consumed", () => {
    const h = new Harness(2);
    toTurnStart(h);
    const pid = h.active();
    const victim = h.g.order.find((p) => p !== pid)!;
    h.room.game!.players[pid].items.push("steal", "steal");
    h.room.game!.players[victim].coins = 15;
    h.act({ type: "useItem", playerId: pid, itemId: "steal", targetId: victim });
    expect(h.g.players[pid].coins).toBe(20);
    expect(h.g.players[victim].coins).toBe(5);
    h.room.game!.players[victim].items.push("shield");
    h.act({ type: "useItem", playerId: pid, itemId: "steal", targetId: victim });
    expect(h.g.players[victim].coins).toBe(5);
    expect(h.g.players[victim].items).not.toContain("shield");
    expect(h.events.some((e) => e.type === "shieldBlocked")).toBe(true);
  });

  it("Sprint Shoes add 3 steps to the roll", () => {
    const h = new Harness(2);
    toTurnStart(h);
    const pid = h.active();
    h.room.game!.players[pid].items.push("sprint-shoes");
    h.act({ type: "useItem", playerId: pid, itemId: "sprint-shoes" });
    h.act({ type: "roll", playerId: pid });
    expect(h.g.dice!.total).toBe(h.g.dice!.values[0] + 3);
    expect(h.g.dice!.bonus).toBe(3);
  });

  it("Push Back moves the chosen player back 4 spaces", () => {
    const h = new Harness(2);
    toTurnStart(h);
    const pid = h.active();
    const other = h.g.order.find((p) => p !== pid)!;
    h.room.game!.players[other].tileId = "m10";
    h.room.game!.players[pid].items.push("push-back");
    h.act({ type: "useItem", playerId: pid, itemId: "push-back", targetId: other });
    expect(h.g.players[other].tileId).toBe("m6");
  });

  it("Swap Places swaps positions; a Shield blocks it", () => {
    const h = new Harness(2);
    toTurnStart(h);
    const pid = h.active();
    const other = h.g.order.find((p) => p !== pid)!;
    h.room.game!.players[other].tileId = "m10";
    h.room.game!.players[pid].items.push("swap-places", "swap-places");
    h.act({ type: "useItem", playerId: pid, itemId: "swap-places", targetId: other });
    expect(h.g.players[pid].tileId).toBe("m10");
    expect(h.g.players[other].tileId).toBe("m0");
    h.room.game!.players[other].items.push("shield");
    h.act({ type: "useItem", playerId: pid, itemId: "swap-places", targetId: other });
    expect(h.g.players[pid].tileId).toBe("m10");
  });

  it("Triple Dice rolls three dice", () => {
    const h = new Harness(2);
    toTurnStart(h);
    const pid = h.active();
    h.room.game!.players[pid].items.push("triple-dice");
    h.act({ type: "useItem", playerId: pid, itemId: "triple-dice" });
    h.act({ type: "roll", playerId: pid });
    expect(h.g.dice!.values).toHaveLength(3);
  });

  it("Coin Magnet takes 3 from every other player (Shield protects)", () => {
    const h = new Harness(3);
    toTurnStart(h);
    const pid = h.active();
    const [o1, o2] = h.g.order.filter((p) => p !== pid);
    h.room.game!.players[o2].items.push("shield");
    h.room.game!.players[pid].items.push("coin-magnet");
    h.act({ type: "useItem", playerId: pid, itemId: "coin-magnet" });
    expect(h.g.players[pid].coins).toBe(13);
    expect(h.g.players[o1].coins).toBe(7);
    expect(h.g.players[o2].coins).toBe(10);
  });

  it("Star Thief steals a star, and can win a star race", () => {
    const h = new Harness(2);
    h.room = { ...h.room, settings: { ...h.room.settings, starGoal: 3 } };
    toTurnStart(h);
    const pid = h.active();
    const other = h.g.order.find((p) => p !== pid)!;
    h.room.game!.players[pid].items.push("star-thief", "star-thief");
    expect(() => h.act({ type: "useItem", playerId: pid, itemId: "star-thief", targetId: other })).toThrow(/star to steal/);
    h.room.game!.players[other].stars = 2;
    h.room.game!.players[pid].stars = 2;
    h.act({ type: "useItem", playerId: pid, itemId: "star-thief", targetId: other });
    expect(h.g.players[other].stars).toBe(1);
    expect(h.g.players[pid].stars).toBe(3);
    expect(h.g.phase).toBe("gameEnd");
    expect(h.g.starGoalWinner).toBe(pid);
  });

  it("Star Coupon makes the next star 10 coins cheaper and is used up", () => {
    const h = new Harness(2);
    toTurnStart(h);
    const pid = h.active();
    h.room.game!.starTileId = "m1";
    h.room.game!.players[pid].coins = 12;
    h.room.game!.players[pid].items.push("star-coupon");
    rollExactly(h, 1);
    h.timeout();
    h.act({ type: "starBuy", playerId: pid, buy: true });
    expect(h.g.players[pid].stars).toBe(1);
    expect(h.g.players[pid].coins).toBe(2);
    expect(h.g.players[pid].items).not.toContain("star-coupon");
  });

  it("Bank Heist grabs the Piggy Bank pot; not usable when empty", () => {
    const h = new Harness(2);
    toTurnStart(h);
    const pid = h.active();
    h.room.game!.players[pid].items.push("bank-heist");
    expect(() => h.act({ type: "useItem", playerId: pid, itemId: "bank-heist" })).toThrow(/empty/);
    h.room.game!.bank = 9;
    h.act({ type: "useItem", playerId: pid, itemId: "bank-heist" });
    expect(h.g.players[pid].coins).toBe(19);
    expect(h.g.bank).toBe(0);
  });

  it("Freeze makes the chosen player skip their next turn", () => {
    const h = new Harness(2);
    toTurnStart(h);
    const pid = h.active();
    const other = h.g.order.find((p) => p !== pid)!;
    h.room.game!.players[pid].items.push("freeze");
    h.act({ type: "useItem", playerId: pid, itemId: "freeze", targetId: other });
    expect(h.g.players[other].effects.frozen).toBe(true);
    h.act({ type: "roll", playerId: pid });
    // play out the rest of this turn until the frozen player's turn comes
    let guard = 0;
    while (!(h.g.order[h.g.activeIndex] === other && h.g.phase !== "turnEnd") && guard++ < 50) h.timeout();
    expect(h.g.phase).toBe("tileEffect");
    expect(h.g.tileResult!.type).toBe("frozen");
    expect(h.g.players[other].effects.frozen).toBe(false);
    h.timeout(); // tileEffect → turnEnd (no roll happened)
    expect(h.g.phase).toBe("turnEnd");
    expect(h.g.dice).toBeNull();
  });

  it("Pick the Target makes the next question about the chosen player", () => {
    const h = new Harness(3);
    toTurnStart(h);
    const pid = h.active();
    const chosen = h.g.order.find((p) => p !== pid)!;
    h.room.game!.players[pid].items.push("pick-target");
    h.act({ type: "useItem", playerId: pid, itemId: "pick-target", targetId: chosen });
    h.room.game!.tileTypes["m1"] = "question";
    h.room.game!.starTileId = "m20";
    rollExactly(h, 1);
    h.timeout();
    expect(h.g.question!.targetId).toBe(chosen);
    expect(h.g.targetOverride).toBeNull();
  });

  it("onQuestion items can only be used by guessers during answering", () => {
    const h = new Harness(2, { mode: "questionDebug" });
    h.timeout();
    const [a] = h.g.order;
    h.room.game!.players[a].items.push("peek");
    expect(() => h.act({ type: "useItem", playerId: a, itemId: "peek" })).toThrow();
  });

  it("shop: buy items up to the limit, with coins", () => {
    const h = new Harness(2);
    toTurnStart(h);
    const pid = h.active();
    h.room.game!.tileTypes["m1"] = "shop";
    h.room.game!.starTileId = "m20";
    rollExactly(h, 1);
    h.timeout();
    expect(h.g.phase).toBe("shop");
    h.room.game!.players[pid].coins = 100;
    const stock = h.g.shop!.stock;
    for (const it of stock.slice(0, 3)) h.act({ type: "shopBuy", playerId: pid, itemId: it });
    expect(h.g.players[pid].items).toHaveLength(3);
    expect(() => h.act({ type: "shopBuy", playerId: pid, itemId: stock[3] })).toThrow(/3 items/);
    h.act({ type: "shopLeave", playerId: pid });
    expect(h.g.phase).toBe("turnEnd");
  });
});

describe("spending coins", () => {
  it("walking past a Shop stops to shop, then keeps walking", () => {
    const h = new Harness(2);
    toTurnStart(h);
    const pid = h.active();
    h.room.game!.tileTypes["m2"] = "shop";
    h.room.game!.starTileId = "m20";
    rollExactly(h, 3);
    expect(h.g.players[pid].tileId).toBe("m2");
    h.timeout();
    expect(h.g.phase).toBe("shop");
    expect(h.g.shop!.passing).toBe(true);
    const item = h.g.shop!.stock.find((i) => h.ctx().content.items.find((x) => x.id === i)!.price <= 10)!;
    h.act({ type: "shopBuy", playerId: pid, itemId: item });
    h.act({ type: "shopLeave", playerId: pid });
    expect(h.g.phase).toBe("moving");
    expect(h.g.players[pid].tileId).toBe("m3");
  });

  it("doesn't stop at a Shop you can't afford", () => {
    const h = new Harness(2);
    toTurnStart(h);
    const pid = h.active();
    h.room.game!.tileTypes["m2"] = "shop";
    h.room.game!.players[pid].coins = 0;
    h.room.game!.starTileId = "m20";
    rollExactly(h, 3);
    expect(h.g.players[pid].tileId).toBe("m3");
  });

  it("Item tile gives a free random item; a full bag gives coins instead", () => {
    const h = new Harness(2);
    toTurnStart(h);
    const pid = h.active();
    h.room.game!.starTileId = "m20";
    rollExactly(h, 3); // m0 → m3 (Item tile)
    h.timeout();
    expect(h.g.phase).toBe("tileEffect");
    expect(h.g.tileResult!.type).toBe("item");
    expect(h.g.players[pid].items).toHaveLength(1);
    expect(h.g.players[pid].items[0]).toBe(h.g.tileResult!.itemId);

    const h2 = new Harness(2);
    toTurnStart(h2);
    const p2 = h2.active();
    h2.room.game!.starTileId = "m20";
    rollExactly(h2, 3); // custom dice used up → bag back to 0, so fill it now
    h2.room.game!.players[p2].items = ["shield", "peek", "steal"];
    const coins = h2.g.players[p2].coins;
    h2.timeout();
    expect(h2.g.tileResult!.itemId).toBeNull();
    expect(h2.g.players[p2].items).toHaveLength(3);
    expect(h2.g.players[p2].coins).toBe(coins + 3);
  });

  it("Star Warp puts you right in front of the star", () => {
    const h = new Harness(2);
    toTurnStart(h);
    const pid = h.active();
    h.room.game!.starTileId = "m10";
    h.room.game!.players[pid].items.push("star-warp");
    h.act({ type: "useItem", playerId: pid, itemId: "star-warp" });
    expect(h.g.players[pid].tileId).toBe("m9");
    expect(h.g.phase).toBe("turnStart");
  });
});

describe("special tiles", () => {
  it("Lucky: win twice the die roll", () => {
    const h = new Harness(2);
    toTurnStart(h);
    const pid = h.active();
    h.room.game!.starTileId = "m20";
    h.room.game!.players[pid].tileId = "m6";
    rollExactly(h, 1); // m7 = Lucky
    h.timeout();
    const r = h.g.tileResult!;
    expect(r.type).toBe("lucky");
    expect(r.roll).toBeGreaterThanOrEqual(1);
    expect(r.coinsDelta).toBe(r.roll! * 2);
  });

  it("Piggy Bank: walking past pays in, landing takes the pot", () => {
    const h = new Harness(2);
    toTurnStart(h);
    const pid = h.active();
    h.room.game!.starTileId = "m20";
    h.room.game!.players[pid].tileId = "m11";
    rollExactly(h, 2); // past m12 (bank) → m13
    expect(h.g.bank).toBe(2);
    expect(h.g.players[pid].coins).toBe(8);
    h.advanceTo("turnStart");
    const other = h.active();
    h.room.game!.players[other].tileId = "m11";
    const before = h.g.players[other].coins;
    rollExactly(h, 1); // lands on m12
    h.timeout();
    expect(h.g.tileResult!.coinsDelta).toBe(2);
    expect(h.g.players[other].coins).toBe(before + 2);
    expect(h.g.bank).toBe(0);
  });

  it("Thief: steals from a random other player; a Shield blocks it", () => {
    const h = new Harness(2);
    toTurnStart(h);
    const pid = h.active();
    const victim = h.g.order.find((p) => p !== pid)!;
    h.room.game!.starTileId = "m10";
    h.room.game!.players[pid].tileId = "m19";
    rollExactly(h, 1); // m20 = Thief
    h.timeout();
    expect(h.g.players[pid].coins).toBe(14);
    expect(h.g.players[victim].coins).toBe(6);

    const h2 = new Harness(2);
    toTurnStart(h2);
    const p2 = h2.active();
    const v2 = h2.g.order.find((p) => p !== p2)!;
    h2.room.game!.starTileId = "m10";
    h2.room.game!.players[p2].tileId = "m19";
    h2.room.game!.players[v2].items.push("shield");
    rollExactly(h2, 1);
    h2.timeout();
    expect(h2.g.players[v2].coins).toBe(10);
    expect(h2.g.players[v2].items).toEqual([]);
  });

  it("Mind Reader: only the lander guesses about someone else, double coins", () => {
    const h = new Harness(3);
    toTurnStart(h);
    const pid = h.active();
    h.room.game!.starTileId = "m20";
    h.room.game!.players[pid].tileId = "m13";
    rollExactly(h, 1); // m14 = Mind Reader
    h.timeout();
    const q = h.g.question!;
    expect(q.context).toBe("mindReader");
    expect(q.targetId).not.toBe(pid);
    expect(q.participants.sort()).toEqual([pid, q.targetId].sort());
    expect(q.multiplier).toBe(2);
    expect(q.question.format).not.toBe("player");
    h.timeout(); // answering
    const outsider = h.g.order.find((p) => p !== pid && p !== q.targetId)!;
    const qq = h.g.question!.question;
    const ans =
      qq.format === "tiles" ? { kind: "option" as const, optionId: qq.options![0].id }
      : qq.format === "higherLower" ? { kind: "hl" as const, dir: "higher" as const }
      : qq.format === "ranking" ? { kind: "order" as const, optionIds: qq.options!.map((o) => o.id) }
      : { kind: "number" as const, value: qq.number!.min };
    expect(() => h.act({ type: "answer", playerId: outsider, answer: ans })).toThrow();
    const before = h.g.players[pid].coins;
    h.act({ type: "answer", playerId: q.targetId, answer: ans });
    h.act({ type: "answer", playerId: pid, answer: ans });
    h.timeout(); // reveal → results
    const extra = qq.format === "number" ? 2 : qq.format === "scale" ? 2 : 0;
    expect(h.g.players[pid].coins).toBe(before + (3 + extra) * 2);
  });
});

describe("tutorial screens", () => {
  it("game start ends once everyone tapped Got it", () => {
    const h = new Harness(3);
    expect(h.g.phase).toBe("gameStart");
    const [a, b, c] = h.g.order;
    h.act({ type: "ready", playerId: a });
    h.act({ type: "ready", playerId: b });
    expect(h.g.phase).toBe("gameStart");
    h.act({ type: "ready", playerId: c });
    expect(h.g.phase).toBe("turnStart");
    expect(h.g.ready).toEqual([]);
  });
});

describe("events", () => {
  it("drawing an event applies it and shows the card", () => {
    const h = new Harness(4, { seed: 7 });
    toTurnStart(h);
    h.room.game!.tileTypes["m1"] = "event";
    h.room.game!.starTileId = "m20";
    rollExactly(h, 1);
    h.timeout();
    expect(h.g.phase).toBe("event");
    expect(h.g.event!.text.length).toBeGreaterThan(5);
    for (const p of Object.values(h.g.players)) expect(p.coins).toBeGreaterThanOrEqual(0);
  });
});

describe("full games", () => {
  for (const n of [2, 3, 4, 6, 8]) {
    it(`${n} players: a whole game on timeouts reaches the podium`, () => {
      const h = new Harness(n, { seed: 100 + n });
      h.room.game!.turnCount = 3;
      let guard = 0;
      while (h.g.phase !== "podium" && guard++ < 3000) {
        // Answer questions randomly so scoring runs.
        const q = h.g.question;
        if (q?.stage === "answering") {
          for (const p of q.participants) {
            if (q.answers[p]) continue;
            const qq = q.question;
            const ans =
              qq.format === "tiles" ? { kind: "option" as const, optionId: qq.options![Math.floor(h.rng() * qq.options!.length)].id }
              : qq.format === "player" ? { kind: "player" as const, playerId: qq.playerChoices![0] }
              : qq.format === "higherLower" ? { kind: "hl" as const, dir: "higher" as const }
              : qq.format === "ranking" ? { kind: "order" as const, optionIds: qq.options!.map((o) => o.id) }
              : { kind: "number" as const, value: qq.number!.min };
            h.act({ type: "answer", playerId: p, answer: ans });
          }
        }
        h.timeout();
        for (const p of Object.values(h.g.players)) expect(p.coins).toBeGreaterThanOrEqual(0);
      }
      expect(h.g.phase).toBe("podium");
      expect(h.g.finalRanking).toHaveLength(n);
      expect(h.g.bonusStars!.revealed).toBe(h.g.bonusStars!.awards.length);
      const steps = Object.values(h.g.players).reduce((s, p) => s + p.stats.stepsMoved, 0);
      expect(steps).toBeGreaterThan(0);
    });
  }
});
