import { describe, expect, it } from "vitest";
import { toPrivateState, toPublicState, type Answer } from "../src";
import { Harness, content } from "./helpers";

const board = (h: Harness) => content.boards.find((b) => b.id === h.g.boardId)!;
const otherTile = (h: Harness, not: string[]) => board(h).tiles.find((t) => !not.includes(t.id) && t.id !== board(h).startTileId)!.id;

function anyAnswer(h: Harness): Answer {
  const qq = h.g.question!.question;
  if (qq.format === "tiles") return { kind: "option", optionId: qq.options![0].id };
  if (qq.format === "player") return { kind: "player", playerId: qq.playerChoices![0] };
  if (qq.format === "higherLower") return { kind: "hl", dir: "higher" };
  if (qq.format === "ranking") return { kind: "order", optionIds: qq.options!.map((o) => o.id) };
  return { kind: "number", value: qq.number!.min };
}

function atTurnStart(n = 3) {
  const h = new Harness(n);
  h.advanceTo("turnStart");
  const me = h.active();
  const others = h.g.order.filter((p) => p !== me);
  return { h, me, others };
}

describe("Mirror", () => {
  it("bounces a steal back at the thief", () => {
    const { h, me, others } = atTurnStart();
    const g = h.room.game!;
    g.players[me].items = ["steal"];
    g.players[me].coins = 20;
    g.players[others[0]].items = ["mirror", "shield"];
    g.players[others[0]].coins = 5;
    h.act({ type: "useItem", playerId: me, itemId: "steal", targetId: others[0] });
    expect(h.g.players[me].coins).toBe(10);
    expect(h.g.players[others[0]].coins).toBe(15);
    expect(h.g.players[others[0]].items).toEqual(["shield"]); // mirror used up, shield kept
  });

  it("bounces a freeze and a push back; a bounced swap does nothing", () => {
    const { h, me, others } = atTurnStart();
    const g = h.room.game!;
    g.players[me].items = ["freeze", "swap-places"];
    g.players[others[0]].items = ["mirror", "mirror"];
    h.act({ type: "useItem", playerId: me, itemId: "freeze", targetId: others[0] });
    expect(h.g.players[me].effects.frozen).toBe(true);
    expect(h.g.players[others[0]].effects.frozen).toBeFalsy();
    const [mine, theirs] = [h.g.players[me].tileId, h.g.players[others[0]].tileId];
    h.act({ type: "useItem", playerId: me, itemId: "swap-places", targetId: others[0] });
    expect([h.g.players[me].tileId, h.g.players[others[0]].tileId]).toEqual([mine, theirs]);
    expect(h.g.players[others[0]].items).toEqual([]);
  });

  it("turns a Coin Magnet around for its owner only", () => {
    const { h, me, others } = atTurnStart();
    const g = h.room.game!;
    g.players[me].items = ["coin-magnet"];
    for (const p of h.g.order) g.players[p].coins = 10;
    g.players[others[0]].items = ["mirror"];
    h.act({ type: "useItem", playerId: me, itemId: "coin-magnet" });
    const amt = content.items.find((i) => i.id === "coin-magnet")!.params.amount ?? 3;
    expect(h.g.players[others[0]].coins).toBe(10 + amt);
    expect(h.g.players[others[1]].coins).toBe(10 - amt);
    expect(h.g.players[me].coins).toBe(10);
  });
});

describe("Swapper", () => {
  it("takes a random item and leaves a shop item behind", () => {
    const { h, me, others } = atTurnStart();
    const g = h.room.game!;
    g.players[me].items = ["swapper"];
    g.players[others[0]].items = ["star-coupon"];
    h.act({ type: "useItem", playerId: me, itemId: "swapper", targetId: others[0] });
    expect(h.g.players[me].items).toEqual(["star-coupon"]);
    expect(h.g.players[others[0]].items).toHaveLength(1);
    expect(content.items.some((i) => i.id === h.g.players[others[0]].items[0])).toBe(true);
  });

  it("needs a target with items; bounced, it costs you an item (never the Swapper itself)", () => {
    const { h, me, others } = atTurnStart();
    const g = h.room.game!;
    g.players[me].items = ["swapper", "peek"];
    expect(() => h.act({ type: "useItem", playerId: me, itemId: "swapper", targetId: others[0] })).toThrow(/items/);
    g.players[others[0]].items = ["mirror"];
    h.act({ type: "useItem", playerId: me, itemId: "swapper", targetId: others[0] });
    expect(h.g.players[others[0]].items).toEqual(["peek"]);
    expect(h.g.players[me].items).toHaveLength(1);
    expect(h.g.players[me].items[0]).not.toBe("peek");
  });
});

describe("Toll Booth", () => {
  it("charges others who pass, then gets torn down by someone landing on it", () => {
    const { h, me, others } = atTurnStart(2);
    const g = h.room.game!;
    g.players[me].items = ["toll-booth"];
    // A tile with exactly one way in that has exactly one way out (no junction in between).
    const prev = board(h).tiles.find((t) => t.next.length === 1 && t.next[0] !== board(h).startTileId && t.id !== board(h).startTileId)!;
    const tile = prev.next[0];
    g.players[me].tileId = tile;
    g.tileTypes[tile] = "blue"; // a plain tile, so the landing doesn't start a question
    h.act({ type: "useItem", playerId: me, itemId: "toll-booth" });
    expect(h.g.tolls).toEqual([{ tileId: tile, ownerId: me, amount: 3, untilRound: h.g.round + 1 }]);
    expect(() => h.act({ type: "useItem", playerId: me, itemId: "toll-booth" })).toThrow();
    // Put the other player right behind the toll and walk them through it.
    const r = h.room.game!;
    r.activeIndex = r.order.indexOf(others[0]);
    r.players[others[0]].tileId = prev.id;
    r.players[others[0]].coins = 10;
    r.players[me].coins = 0;
    r.starTileId = otherTile(h, [tile, prev.id]);
    r.dice = { values: [1], total: 1, kind: "normal" };
    r.phase = "rolling";
    h.advanceTo("turnEnd");
    expect(h.g.players[me].coins).toBe(3);
    expect(h.g.tolls).toEqual([]); // landed on it: torn down
  });
});

describe("Star Radar", () => {
  it("locks in the star's next tile and only shows it to the user", () => {
    const { h, me, others } = atTurnStart(3);
    const g = h.room.game!;
    g.players[me].items = ["star-radar"];
    h.act({ type: "useItem", playerId: me, itemId: "star-radar" });
    const next = h.g.starNext!;
    expect(next).toBeTruthy();
    expect(next).not.toBe(h.g.starTileId);
    expect(toPrivateState(h.room, me, {}, h.now).starNext).toBe(next);
    expect(toPrivateState(h.room, others[0], {}, h.now).starNext).toBeNull();
    expect(JSON.stringify(toPublicState(h.room, {}, h.now))).not.toContain(`"starNext"`);
    // Buying the star sends it exactly there.
    const r = h.room.game!;
    r.players[me].coins = 50;
    r.players[me].tileId = r.starTileId;
    r.phase = "starPurchase";
    r.star = { passing: false };
    h.act({ type: "starBuy", playerId: me, buy: true });
    expect(h.g.starTileId).toBe(next);
    expect(h.g.starNext).toBeNull();
  });
});

describe("Copycat", () => {
  it("you get whatever the copied guesser locks in", () => {
    const h = new Harness(3, { mode: "questionDebug" });
    h.timeout(); // game start → intro
    h.timeout(); // intro → answering
    const q = h.g.question!;
    const [a, b] = q.participants.filter((p) => p !== q.targetId);
    h.room.game!.players[a].items = ["copycat"];
    expect(() => h.act({ type: "useItem", playerId: a, itemId: "copycat", targetId: q.targetId })).toThrow();
    h.act({ type: "useItem", playerId: a, itemId: "copycat", targetId: b });
    expect(() => h.act({ type: "answer", playerId: a, answer: anyAnswer(h) })).toThrow(/copying/);
    expect(toPublicState(h.room, {}, h.now).game!.question!.answered).toContain(a);
    h.act({ type: "answer", playerId: b, answer: anyAnswer(h) });
    h.act({ type: "answer", playerId: q.targetId, answer: anyAnswer(h) });
    expect(h.g.question!.stage).toBe("reveal");
    expect(h.g.question!.answers[a]).toEqual(h.g.question!.answers[b]);
  });
});

describe("Gamble tile", () => {
  function landOnGamble(coins: number, seed = 1) {
    const h = new Harness(2, { seed });
    h.advanceTo("turnStart");
    const g = h.room.game!;
    const me = h.active();
    const tile = otherTile(h, [g.starTileId]);
    g.tileTypes[tile] = "gamble";
    g.players[me].tileId = tile;
    g.players[me].coins = coins;
    g.movement = { remaining: 0, path: [], next: "landed" };
    g.phase = "moving";
    h.timeout();
    return { h, me };
  }
  it("bets half your coins, at most 20, and can be declined", () => {
    const { h, me } = landOnGamble(100);
    expect(h.g.phase).toBe("tileChoice");
    expect(h.g.tileChoice).toEqual({ kind: "gamble", amount: 20 });
    h.act({ type: "tileChoice", playerId: me, accept: false });
    expect(h.g.players[me].coins).toBe(100);
    expect(landOnGamble(9).h.g.tileChoice!.amount).toBe(4);
  });
  it("wins or loses exactly the stake", () => {
    const seen = new Set<number>();
    for (let seed = 1; seed < 30 && seen.size < 2; seed++) {
      const { h, me } = landOnGamble(30, seed);
      h.act({ type: "tileChoice", playerId: me, accept: true });
      seen.add(h.g.players[me].coins);
    }
    expect([...seen].sort()).toEqual([15, 45]);
  });
  it("with no coins there's nothing to bet", () => {
    expect(landOnGamble(1).h.g.phase).toBe("tileEffect");
  });
});

describe("Rest Stop tile", () => {
  it("pay to roll again right away", () => {
    const h = new Harness(2);
    h.advanceTo("turnStart");
    const g = h.room.game!;
    const me = h.active();
    const tile = otherTile(h, [g.starTileId]);
    g.tileTypes[tile] = "rest-stop";
    g.players[me].tileId = tile;
    g.players[me].coins = 10;
    g.movement = { remaining: 0, path: [], next: "landed" };
    g.phase = "moving";
    h.timeout();
    expect(h.g.tileChoice).toEqual({ kind: "restStop", amount: 3 });
    h.act({ type: "tileChoice", playerId: me, accept: true });
    expect(h.g.phase).toBe("rolling");
    expect(h.g.players[me].coins).toBe(7);
    expect(h.active()).toBe(me);
  });
  it("the timer running out means moving on", () => {
    const h = new Harness(2);
    h.advanceTo("turnStart");
    const g = h.room.game!;
    const me = h.active();
    const tile = otherTile(h, [g.starTileId]);
    g.tileTypes[tile] = "rest-stop";
    g.players[me].tileId = tile;
    g.players[me].coins = 10;
    g.movement = { remaining: 0, path: [], next: "landed" };
    g.phase = "moving";
    h.timeout();
    h.timeout();
    expect(h.g.phase).toBe("turnEnd");
    expect(h.g.players[me].coins).toBe(10);
  });
});

describe("Warp Pipe", () => {
  it("moves you to the linked pipe, and offers the star if it's there", () => {
    const h = new Harness(2);
    h.advanceTo("turnStart");
    const g = h.room.game!;
    const me = h.active();
    const b = board(h);
    const [from, to] = b.tiles.filter((t) => t.id !== b.startTileId).map((t) => t.id);
    // Fake a pipe on this board.
    (b.tiles.find((t) => t.id === from) as { warpTo?: string }).warpTo = to;
    try {
      g.tileTypes[from] = "warp";
      g.starTileId = to;
      g.players[me].tileId = from;
      g.players[me].coins = 30;
      g.movement = { remaining: 0, path: [], next: "landed" };
      g.phase = "moving";
      h.timeout();
      expect(h.g.players[me].tileId).toBe(to);
      expect(h.g.phase).toBe("tileEffect");
      h.timeout();
      expect(h.g.phase).toBe("starPurchase");
      h.act({ type: "starBuy", playerId: me, buy: true });
      expect(h.g.players[me].stars).toBe(1);
      expect(h.g.phase).toBe("turnEnd");
    } finally {
      delete (b.tiles.find((t) => t.id === from) as { warpTo?: string }).warpTo;
    }
  });
});

describe("events", () => {
  function drawEvent(id: string, n = 3) {
    const h = new Harness(n);
    h.advanceTo("turnStart");
    const g = h.room.game!;
    const me = h.active();
    const tile = otherTile(h, [g.starTileId]);
    g.tileTypes[tile] = "event";
    g.players[me].tileId = tile;
    g.movement = { remaining: 0, path: [], next: "landed" };
    g.phase = "moving";
    const original = content.events;
    content.events = original.filter((e) => e.id === id);
    try {
      h.timeout();
    } finally {
      content.events = original;
    }
    expect(h.g.event?.cardId).toBe(id);
    return { h, me };
  }
  it("Star Surge: stars cost 10 more until the round ends", () => {
    const { h, me } = drawEvent("star-surge");
    expect(h.g.starSurge).toEqual({ round: h.g.round, extra: 10 });
    const r = h.room.game!;
    r.players[me].coins = 25;
    r.phase = "starPurchase";
    r.star = { passing: false };
    h.act({ type: "starBuy", playerId: me, buy: true });
    expect(h.g.players[me].stars).toBe(0); // 30 now, can't afford
  });
  it("Item Amnesty: one random item each, for 4 coins", () => {
    const { h: h2, me } = (() => {
      const hh = new Harness(3);
      hh.advanceTo("turnStart");
      const g = hh.room.game!;
      const p = hh.active();
      for (const pid of g.order) g.players[pid].items = pid === p ? [] : ["peek", "shield"];
      const tile = otherTile(hh, [g.starTileId]);
      g.tileTypes[tile] = "event";
      g.players[p].tileId = tile;
      g.movement = { remaining: 0, path: [], next: "landed" };
      g.phase = "moving";
      const original = content.events;
      content.events = original.filter((e) => e.id === "item-amnesty");
      for (const pid of g.order) g.players[pid].coins = 0;
      hh.timeout();
      content.events = original;
      return { h: hh, me: p };
    })();
    for (const pid of h2.g.order) {
      if (pid === me) expect(h2.g.players[pid].coins).toBe(0);
      else {
        expect(h2.g.players[pid].items).toHaveLength(1);
        expect(h2.g.players[pid].coins).toBe(4);
      }
    }
  });
  it("Spotlight: the next 2 questions are about one player", () => {
    const { h } = drawEvent("spotlight");
    const who = h.g.spotlight!.targetId;
    expect(h.g.spotlight!.left).toBe(2);
    const r = h.room.game!;
    const tile = otherTile(h, [r.starTileId]);
    for (let i = 0; i < 2; i++) {
      const pid = h.g.order.find((p) => p !== who)!;
      const g = h.room.game!;
      g.activeIndex = g.order.indexOf(pid);
      g.tileTypes[tile] = "question";
      g.players[pid].tileId = tile;
      g.movement = { remaining: 0, path: [], next: "landed" };
      g.phase = "moving";
      h.timeout();
      expect(h.g.question!.targetId).toBe(who);
    }
    expect(h.g.spotlight).toBeNull();
  });
});
