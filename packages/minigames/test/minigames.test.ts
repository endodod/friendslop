import { describe, expect, it } from "vitest";
import { createRng, type MinigameServices, type MinigameStepCtx } from "@party-game/shared";
import { Harness, content } from "../../shared/test/helpers";
import { MINIGAMES } from "../src/server";
import { reactionTap } from "../src/reaction-tap/logic";
import { simulate, stacker, sliderX, towerScore } from "../src/stacker/logic";
import { layout, memoryFlip, replay } from "../src/memory-flip/logic";
import { pumpIt } from "../src/pump-it/logic";
import { redLight, RED_GRACE_MS } from "../src/red-light/logic";
import { chicken, ALL_IN_MS, JOIN_MS } from "../src/chicken/logic";
import { majorityOf } from "../src/most-likely-to/logic";

const services = {} as MinigameServices;
const init = (def: any, players = ["a", "b"], bonuses: string[] = [], now = 0) =>
  def.init({ players, bonuses, seed: 123, rng: createRng(1), now, services });
const ctx = (now: number): MinigameStepCtx => ({ now, rng: createRng(9), services });

describe("registry", () => {
  it("every registered mini-game has content metadata", () => {
    for (const id of Object.keys(MINIGAMES)) expect(content.minigames.find((m) => m.id === id), id).toBeDefined();
  });
});

describe("reaction-tap", () => {
  it("best try counts; a false start disqualifies; the bonus gives one extra try", () => {
    let s = init(reactionTap, ["a", "b", "c"], ["b"]);
    s = reactionTap.onSubmit!(s, "a", { times: [300, 250, 400], falseStart: false }, ctx(0));
    s = reactionTap.onSubmit!(s, "b", { times: [300, 260, 400, 240], falseStart: false }, ctx(0));
    s = reactionTap.onSubmit!(s, "c", { times: [180], falseStart: true }, ctx(0));
    expect(s.scores.a).toBe(250);
    expect(s.scores.b).toBe(240);
    expect(reactionTap.isFinished(s, 0)).toBe(true);
    const res = reactionTap.results(s);
    expect(res.map((r) => r.playerId)).toEqual(["b", "a", "c"]);
    expect(res[2].label).toBe("False start");
  });
  it("only bonus players get a 4th try", () => {
    let s = init(reactionTap);
    s = reactionTap.onSubmit!(s, "a", { times: [300, 250, 400, 120], falseStart: false }, ctx(0));
    expect(s.rejected).toContain("a");
  });
  it("rejects reaction times under 100ms", () => {
    let s = init(reactionTap);
    s = reactionTap.onSubmit!(s, "a", { times: [50, 250, 400], falseStart: false }, ctx(0));
    expect(s.scores.a).toBeNull();
    expect(s.rejected).toContain("a");
  });
});

describe("stacker", () => {
  it("equal heights share a place", () => {
    const res = stacker.results({ players: ["a", "b", "c"], bonuses: [], seed: 1, scores: { a: 5, b: 5, c: 3 }, submitted: ["a", "b", "c"], rejected: [] } as never);
    expect(res.find((r) => r.playerId === "a")!.rank).toBe(1);
    expect(res.find((r) => r.playerId === "b")!.rank).toBe(1);
    expect(res.find((r) => r.playerId === "c")!.rank).toBe(3);
    expect(res[0].label).toBe("5 blocks");
  });
  it("server re-simulation matches and rewards aligned drops", () => {
    // Find drop times where the slider is exactly over the tower.
    const seed = 123;
    const drops: number[] = [];
    for (let lvl = 1; lvl <= 5; lvl++) {
      const top = simulate(seed, false, drops).levels.at(-1)!;
      let t = 150;
      while (Math.abs(sliderX(t, top.w, lvl, seed) - top.x) > 0.6) t += 1;
      drops.push(t);
    }
    const sim = simulate(seed, false, drops);
    expect(sim.levels).toHaveLength(6);
    let s = init(stacker);
    s = stacker.onSubmit!(s, "a", { drops }, ctx(0));
    expect(s.scores.a).toBe(towerScore(sim.levels));
    s = stacker.onSubmit!(s, "b", { drops: [50] }, ctx(0));
    expect(s.scores.b).toBeNull(); // implausibly fast
  });
  it("bonus starts wider", () => {
    expect(simulate(1, true, []).levels[0].w).toBeGreaterThan(simulate(1, false, []).levels[0].w);
  });
});

describe("memory-flip", () => {
  it("replays flips and validates them", () => {
    const cards = layout(5);
    const pairs: number[] = [];
    const seen = new Set<number>();
    for (let i = 0; i < cards.length; i++) {
      if (seen.has(i)) continue;
      const j = cards.findIndex((c, k) => k !== i && c === cards[i]);
      pairs.push(i, j);
      seen.add(i).add(j);
    }
    expect(replay(cards, pairs)).toEqual({ solved: true, valid: true, pairs: 8 });
    expect(replay(cards, [0, 0]).valid).toBe(false);
    let s = memoryFlip.init({ players: ["a", "b"], bonuses: [], seed: 5, rng: createRng(1), now: 0, services });
    s = memoryFlip.onSubmit!(s, "a", { flips: pairs, timeMs: 20000 }, ctx(0));
    s = memoryFlip.onSubmit!(s, "b", { flips: pairs, timeMs: 100 }, ctx(0));
    expect(s.scores.a).toBe(20000);
    expect(s.scores.b).toBeNull();
  });
});

describe("pump-it", () => {
  it("pumps pop at the secret threshold; stopping banks", () => {
    let s = init(pumpIt);
    const pop = s.popAt[0];
    let t = 0;
    for (let i = 0; i < pop; i++) s = pumpIt.onInput!(s, "a", { action: "pump" }, ctx((t += 100)));
    expect(s.runs.a.balloons[0].popped).toBe(true);
    s = pumpIt.onInput!(s, "b", { action: "pump" }, ctx((t += 100)));
    s = pumpIt.onInput!(s, "b", { action: "pump" }, ctx((t += 100)));
    s = pumpIt.onInput!(s, "b", { action: "stop" }, ctx((t += 100)));
    // Others' pumps stay secret while anyone is still playing; the player sees their own.
    expect((pumpIt.publicState(s, t) as any).runs.b.total).toBeUndefined();
    expect((pumpIt.publicState(s, t) as any).runs.b.balloons).toBeUndefined();
    expect((pumpIt.privateState!(s, "b", t) as any).run.total).toBe(2);
    expect(JSON.stringify(pumpIt.publicState(s, t))).not.toContain("popAt");
  });
  it("ignores inhumanly fast pumping", () => {
    let s = init(pumpIt);
    s = pumpIt.onInput!(s, "a", { action: "pump" }, ctx(1000));
    s = pumpIt.onInput!(s, "a", { action: "pump" }, ctx(1010));
    expect(s.runs.a.balloons[0].pumps).toBe(1);
  });
});

describe("red-light", () => {
  it("moving on red sends you back to start; first to finish wins", () => {
    let s = init(redLight);
    s = { ...s, light: "red", lightSince: 0, lightUntil: 100000, pos: { a: 50, b: 50 } };
    s = redLight.onInput!(s, "a", { hold: true }, ctx(RED_GRACE_MS + 10));
    s = redLight.tick!(s, ctx(RED_GRACE_MS + 50));
    expect(s.pos.a).toBe(0);
    expect(s.pos.b).toBe(50);
    s = { ...s, light: "green", lightUntil: 1e9, pos: { a: 99.9, b: 0 }, lastTick: 1000 };
    s = redLight.onInput!(s, "a", { hold: true }, ctx(1000));
    s = redLight.tick!(s, ctx(1100));
    expect(redLight.isFinished(s, 1100)).toBe(true);
    expect(redLight.results(s)[0].playerId).toBe("a");
  });
});

describe("chicken", () => {
  it("cash out before the crash scores, holding through the crash busts", () => {
    let s = init(chicken);
    s = chicken.onInput!(s, "a", { hold: true }, ctx(10));
    s = chicken.onInput!(s, "b", { hold: true }, ctx(10));
    // Everyone grabbed: it starts shortly instead of waiting out the join window.
    expect(s.growStartsAt).toBe(10 + ALL_IN_MS);
    s = chicken.tick!(s, ctx(s.growStartsAt + 10));
    s = chicken.onInput!(s, "a", { hold: false }, ctx(s.growStartsAt + 1000));
    s = chicken.tick!(s, ctx(s.crashAt + 1));
    expect(s.status.a).toBe("cashed");
    expect(s.status.b).toBe("busted");
    expect(chicken.results(s)[0].playerId).toBe("a");
    expect(JSON.stringify(chicken.publicState(init(chicken), 0))).not.toMatch(/crashAt|crashMs/);
  });

  it("waits for stragglers; someone who never holds is out without ending it for the rest", () => {
    let s = init(chicken, ["a", "b", "c"]);
    s = chicken.onInput!(s, "a", { hold: true }, ctx(10));
    s = chicken.onInput!(s, "b", { hold: true }, ctx(10));
    s = chicken.tick!(s, ctx(3000));
    expect(chicken.isFinished(s, 3000)).toBe(false);
    expect(s.status.c).toBe("waiting");
    s = chicken.tick!(s, ctx(JOIN_MS + 10));
    expect(s.status.c).toBe("out");
    expect(chicken.isFinished(s, JOIN_MS + 10)).toBe(false);
    s = chicken.tick!(s, ctx(s.crashAt + 1));
    expect(chicken.results(s).find((p) => p.playerId === "c")!.label).toBe("never held");
  });
});

describe("most-likely-to", () => {
  it("majority rules", () => {
    expect(majorityOf({ a: "c", b: "c", c: "a" })).toEqual(["c"]);
    expect(majorityOf({ a: "b", b: "a" })).toEqual([]);
    expect(majorityOf({ a: "b", b: "b" })).toEqual(["b"]);
  });
});

describe("mini-game flow in a real game", () => {
  it("bonus question comes first and awards the bonus to matchers; then the rules, then the countdown", () => {
    const h = new Harness(3, { minigames: MINIGAMES, seed: 11 });
    h.advanceTo("roundEnd");
    h.timeout();
    const mg = h.g.minigame!;
    if (mg.kind === "questionOnly") return expect(h.g.phase).toBe("minigameIntro"); // no bonus question for these
    expect(h.g.phase).toBe("minigameQuestion");
    h.timeout(); // intro → answering
    const q = h.g.question!;
    const qq = q.question;
    const same =
      qq.format === "tiles" ? { kind: "option" as const, optionId: qq.options![0].id }
      : qq.format === "player" ? { kind: "player" as const, playerId: qq.playerChoices![0] }
      : qq.format === "higherLower" ? { kind: "hl" as const, dir: "higher" as const }
      : qq.format === "ranking" ? { kind: "order" as const, optionIds: qq.options!.map((o) => o.id) }
      : { kind: "number" as const, value: qq.number!.min };
    for (const p of q.participants) if (p !== q.targetId) h.act({ type: "answer", playerId: p, answer: same });
    h.act({ type: "answer", playerId: q.targetId, answer: same });
    h.advanceTo("minigameIntro");
    expect(h.g.minigame!.bonuses.sort()).toEqual([...q.participants].sort());
    h.timeout();
    expect(h.g.phase).toBe("minigameCountdown");
  });

  for (const n of [2, 3, 4, 6, 8]) {
    it(`${n} players: full game with all mini-games, timeouts only`, () => {
      const h = new Harness(n, { minigames: MINIGAMES, seed: 300 + n });
      h.room.game!.turnCount = 6;
      let guard = 0;
      const played = new Set<string>();
      while (h.g.phase !== "podium" && guard++ < 20000) {
        if (h.g.minigame) played.add(h.g.minigame.id);
        // realtime mini-games need ticks between deadlines
        if (h.g.phase === "minigamePlaying") {
          h.now += 500;
          h.tick();
        } else h.timeout();
        for (const p of Object.values(h.g.players)) expect(p.coins).toBeGreaterThanOrEqual(0);
      }
      expect(h.g.phase).toBe("podium");
      expect(played.size).toBeGreaterThanOrEqual(5);
    });
  }
});

describe("playtest fixes", () => {
  it("hot or not: reference is 2-9, never the answer", async () => {
    const { makeReference } = await import("../src/hot-or-not/logic");
    const rng = createRng(3);
    for (let truth = 1; truth <= 10; truth++)
      for (let i = 0; i < 50; i++) {
        const r = makeReference(truth, rng);
        expect(r).toBeGreaterThanOrEqual(2);
        expect(r).toBeLessThanOrEqual(9);
        expect(r).not.toBe(truth);
      }
  });

  it("minefield: every bonus player gets a different safe tile", async () => {
    const { minefield } = await import("../src/minefield/logic");
    for (let seed = 1; seed < 30; seed++) {
      const s = minefield.init({ players: ["a", "b", "c", "d"], bonuses: ["a", "b", "c", "d"], seed, rng: createRng(seed), now: 0, services: {} as never });
      const tiles = Object.values(s.safeHint);
      expect(new Set(tiles).size).toBe(4);
      expect(tiles).not.toContain(s.bomb);
    }
  });

  it("hot potato: a bonus player survives their first explosion only", async () => {
    const { hotPotato } = await import("../src/hot-potato/logic");
    let s = hotPotato.init({ players: ["a", "b"], bonuses: ["a"], seed: 1, rng: createRng(1), now: 0, services: {} as never });
    const ctx = (now: number) => ({ now, rng: createRng(2), services: {} as never });
    s = { ...s, holder: "a" };
    s = hotPotato.tick!(s, ctx(s.explodeAt));
    expect(s.alive).toContain("a");
    expect(s.revived).toEqual(["a"]);
    s = hotPotato.tick!(s, ctx(s.boomUntil! + 1));
    s = { ...s, holder: "a" };
    s = hotPotato.tick!(s, ctx(s.explodeAt));
    expect(s.alive).not.toContain("a");
  });
});

describe("hot potato challenges", () => {
  it("every challenge has 3 choices, a valid answer, and the answer stays secret", async () => {
    const { hotPotato } = await import("../src/hot-potato/logic");
    const kinds = new Set<string>();
    for (let seed = 1; seed < 80; seed++) {
      const s = hotPotato.init({ players: ["a", "b"], bonuses: [], seed, rng: createRng(seed), now: 0, services: {} as never });
      const pr = s.prompt;
      kinds.add(pr.kind);
      expect(pr.choices).toHaveLength(3);
      expect(pr.answer).toBeGreaterThanOrEqual(0);
      expect(pr.answer).toBeLessThan(3);
      if (pr.kind === "match") expect(pr.choices[pr.answer]).toBe(pr.icon);
      if (pr.kind === "ink") expect(pr.choices[pr.answer]).toBe(pr.ink);
      if (pr.kind === "count") expect(Number(pr.choices[pr.answer])).toBe(pr.dots.length);
      if (pr.kind === "odd") expect(pr.choices.filter((c) => c === pr.choices[pr.answer])).toHaveLength(1);
      expect(new Set(pr.choices).size).toBe(pr.kind === "odd" ? 2 : 3);
      expect(JSON.stringify(hotPotato.publicState(s, 0))).not.toContain('"answer"');
    }
    expect(kinds.size).toBe(4);
  });
});
