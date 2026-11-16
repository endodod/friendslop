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
    h.act({ type: "useItem", playerId: pid, itemId: "steal", targetId: victim });
    expect(h.g.players[pid].coins).toBe(15);
    expect(h.g.players[victim].coins).toBe(5);
    h.room.game!.players[victim].items.push("shield");
    h.act({ type: "useItem", playerId: pid, itemId: "steal", targetId: victim });
    expect(h.g.players[victim].coins).toBe(5);
    expect(h.g.players[victim].items).not.toContain("shield");
    expect(h.events.some((e) => e.type === "shieldBlocked")).toBe(true);
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
  for (const n of [2, 3, 4]) {
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
