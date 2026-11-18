import { describe, expect, it } from "vitest";
import { createRng, type MinigameServices, type MinigameStepCtx } from "@party-game/shared";
import { loneWolf, loneWolfGame, PICK_MS, REVEAL_MS, ROUNDS } from "../src/lone-wolf/logic";
import { tugOfWar, READY_MS, PULL_MS } from "../src/tug-of-war/logic";
import { arrowRush, arrows, expected, opposite, scoreRun } from "../src/arrow-rush/logic";
import { COUNT, grid, numberHunt, replay } from "../src/number-hunt/logic";

const services = {} as MinigameServices;
const ctx = (now: number): MinigameStepCtx => ({ now, rng: createRng(4), services });
const init = (def: any, players = ["a", "b", "c"], bonuses: string[] = [], now = 0) =>
  def.init({ players, bonuses, seed: 77, rng: createRng(3), now, services });

describe("lone-wolf", () => {
  it("lowest unique number wins", () => {
    expect(loneWolf({ a: 1, b: 1, c: 2 })).toBe("c");
    expect(loneWolf({ a: 3, b: 2, c: 5 })).toBe("b");
    expect(loneWolf({ a: 2, b: 2 })).toBeNull();
  });
  it("plays 3 rounds, hides picks until reveal, bonus doubles wins", () => {
    let s = init(loneWolfGame, ["a", "b", "c"], ["c"]);
    s = loneWolfGame.onInput!(s, "a", { pick: 1 }, ctx(10));
    expect(JSON.stringify(loneWolfGame.publicState(s, 10))).not.toContain('"a":1');
    s = loneWolfGame.onInput!(s, "a", { pick: 4 }, ctx(11)); // can't change
    s = loneWolfGame.onInput!(s, "b", { pick: 1 }, ctx(12));
    s = loneWolfGame.onInput!(s, "c", { pick: 3 }, ctx(13));
    expect(s.phase).toBe("reveal");
    expect(s.points.c).toBe(2);
    let t = 13;
    for (let r = 1; r < ROUNDS; r++) {
      s = loneWolfGame.tick!(s, ctx((t += REVEAL_MS)));
      expect(s.phase).toBe("pick");
      s = loneWolfGame.tick!(s, ctx((t += PICK_MS))); // nobody picks
    }
    s = loneWolfGame.tick!(s, ctx((t += REVEAL_MS)));
    expect(loneWolfGame.isFinished(s, t)).toBe(true);
    expect(loneWolfGame.results(s)[0].playerId).toBe("c");
  });
});

describe("tug-of-war", () => {
  it("ignores taps before go and too-fast taps; the pulling team wins", () => {
    let s = init(tugOfWar, ["a", "b"]);
    const [[l], [r]] = s.teams;
    s = tugOfWar.onInput!(s, l, { tap: true }, ctx(100));
    expect(s.rope).toBe(0);
    let t = READY_MS;
    s = tugOfWar.onInput!(s, l, { tap: true }, ctx((t += 1)));
    s = tugOfWar.onInput!(s, l, { tap: true }, ctx((t += 5))); // too fast
    expect(s.taps[l]).toBe(1);
    while (s.winner === null) s = tugOfWar.onInput!(s, l, { tap: true }, ctx((t += 100)));
    expect(s.winner).toBe(0);
    const res = tugOfWar.results(s);
    expect(res.find((p) => p.playerId === l)!.rank).toBe(1);
    expect(res.find((p) => p.playerId === r)!.rank).toBe(2);
  });
  it("time out: the side with the rope wins, uneven teams are balanced", () => {
    let s = init(tugOfWar, ["a", "b", "c"]);
    expect(s.teams[0]).toHaveLength(2);
    s = tugOfWar.onInput!(s, s.teams[1][0], { tap: true }, ctx(READY_MS + 10));
    const solo = s.rope;
    s = tugOfWar.onInput!(s, s.teams[0][0], { tap: true }, ctx(READY_MS + 20));
    s = tugOfWar.onInput!(s, s.teams[0][1], { tap: true }, ctx(READY_MS + 30));
    expect(s.rope).toBeCloseTo(0);
    expect(solo).toBeGreaterThan(0);
    s = tugOfWar.tick!(s, ctx(READY_MS + PULL_MS + 1));
    expect(tugOfWar.isFinished(s, 0)).toBe(true);
  });
});

describe("arrow-rush", () => {
  it("scores correct presses, red arrows flip, mistakes cost a point", () => {
    const as = arrows(9);
    const perfect = as.slice(0, 20).map(expected);
    expect(scoreRun(9, perfect, false)).toBe(20);
    const withMiss = [opposite(expected(as[0])), ...perfect];
    expect(scoreRun(9, withMiss, false)).toBe(19);
    expect(scoreRun(9, withMiss, true)).toBe(20);
    expect(as.some((a) => a.flip)).toBe(true);
    let s = init(arrowRush, ["a", "b"]);
    s = arrowRush.onSubmit!(s, "a", { presses: arrows(77).slice(0, 10).map(expected) }, ctx(0));
    s = arrowRush.onSubmit!(s, "b", { presses: Array(150).fill("up") }, ctx(0));
    expect(s.scores.a).toBe(10);
    expect(s.scores.b).toBeNull();
  });
});

describe("number-hunt", () => {
  it("replays taps, penalizes misses and rejects impossible times", () => {
    const cells = grid(77);
    const order = Array.from({ length: COUNT }, (_, n) => cells.indexOf(n + 1));
    expect(replay(cells, order, false)).toEqual({ found: COUNT, misses: 0 });
    expect(replay(cells, order.slice(3), true).found).toBe(COUNT);
    let s = init(numberHunt, ["a", "b", "c"]);
    s = numberHunt.onSubmit!(s, "a", { taps: [order[1], ...order], timeMs: 20000 }, ctx(0));
    s = numberHunt.onSubmit!(s, "b", { taps: order.slice(0, 10), timeMs: 40000 }, ctx(0));
    s = numberHunt.onSubmit!(s, "c", { taps: order, timeMs: 500 }, ctx(0));
    expect(s.scores.a).toBe(21000);
    expect(s.scores.c).toBeNull();
    const res = numberHunt.results(s);
    expect(res[0].playerId).toBe("a");
    expect(res[1].playerId).toBe("b");
    expect(res[1].label).toBe("10/25 found");
  });
});
