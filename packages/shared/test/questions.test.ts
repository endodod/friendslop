import { describe, expect, it } from "vitest";
import {
  bonusRecipients,
  createRng,
  getFormat,
  resolveQuestion,
  scoreQuestion,
  selectQuestion,
  withinTolerance,
  type ResolvedQuestion,
} from "../src";
import { content } from "./helpers";

const tilesQ: ResolvedQuestion = {
  id: "t",
  format: "tiles",
  themeId: "food",
  prompt: "?",
  options: [
    { id: "a0", label: "A" },
    { id: "a1", label: "B" },
    { id: "a2", label: "C" },
  ],
  isData: false,
};
const numberQ: ResolvedQuestion = {
  id: "n",
  format: "number",
  themeId: "food",
  prompt: "?",
  number: { min: 0, max: 100, step: 1, tolerance: { type: "absolute", value: 2 } },
  isData: false,
};

describe("tolerance", () => {
  it("absolute", () => {
    const t = { type: "absolute" as const, value: 2 };
    expect(withinTolerance(10, 12, t, 1)).toBe(true);
    expect(withinTolerance(10, 13, t, 1)).toBe(false);
    expect(withinTolerance(10, 14, t, 1, 2)).toBe(true); // wide tolerance
  });
  it("relative with a floor of one step", () => {
    const t = { type: "relative" as const, value: 0.2 };
    expect(withinTolerance(80, 100, t, 1)).toBe(true);
    expect(withinTolerance(79, 100, t, 1)).toBe(false);
    expect(withinTolerance(1, 0, t, 1)).toBe(true); // truth 0 → at least one step
  });
});

describe("format matching", () => {
  it("tiles: same tile = match", () => {
    const f = getFormat("tiles");
    expect(f.compare(tilesQ, { kind: "option", optionId: "a1" }, { kind: "option", optionId: "a1" }).match).toBe(true);
    expect(f.compare(tilesQ, { kind: "option", optionId: "a0" }, { kind: "option", optionId: "a1" }).match).toBe(false);
  });
  it("number: within tolerance = match, exact = perfect", () => {
    const f = getFormat("number");
    const r = f.compare(numberQ, { kind: "number", value: 41 }, { kind: "number", value: 42 });
    expect(r).toMatchObject({ match: true, perfect: false });
    expect(f.compare(numberQ, { kind: "number", value: 42 }, { kind: "number", value: 42 }).perfect).toBe(true);
  });
  it("number answers are validated against range and step", () => {
    const f = getFormat("number");
    expect(f.validate(numberQ, { kind: "number", value: 50 })).toBe(true);
    expect(f.validate(numberQ, { kind: "number", value: 101 })).toBe(false);
    expect(f.validate(numberQ, { kind: "number", value: 50.5 })).toBe(false);
    expect(f.validate(numberQ, { kind: "option", optionId: "a0" })).toBe(false);
  });
  it("scale defaults to ±1", () => {
    const q: ResolvedQuestion = { ...numberQ, format: "scale", number: { min: 1, max: 10, step: 1, tolerance: { type: "absolute", value: 1 } } };
    expect(getFormat("scale").compare(q, { kind: "number", value: 6 }, { kind: "number", value: 7 }).match).toBe(true);
    expect(getFormat("scale").compare(q, { kind: "number", value: 5 }, { kind: "number", value: 7 }).match).toBe(false);
  });
  it("ranking: points per correct position, match at half", () => {
    const q: ResolvedQuestion = { ...tilesQ, format: "ranking", options: [...tilesQ.options!, { id: "a3", label: "D" }] };
    const truth = { kind: "order" as const, optionIds: ["a0", "a1", "a2", "a3"] };
    const r = getFormat("ranking").compare(q, { kind: "order", optionIds: ["a0", "a1", "a3", "a2"] }, truth);
    expect(r).toMatchObject({ match: true, perfect: false, score: 0.5 });
    expect(getFormat("ranking").compare(q, { kind: "order", optionIds: ["a3", "a2", "a1", "a0"] }, truth).match).toBe(false);
    expect(getFormat("ranking").validate(q, { kind: "order", optionIds: ["a0", "a1", "a2"] })).toBe(false);
  });
  it("player and higherLower", () => {
    const pq: ResolvedQuestion = { ...tilesQ, format: "player", options: undefined, playerChoices: ["p1", "p2"] };
    expect(getFormat("player").validate(pq, { kind: "player", playerId: "p3" })).toBe(false);
    expect(getFormat("player").compare(pq, { kind: "player", playerId: "p1" }, { kind: "player", playerId: "p1" }).match).toBe(true);
    expect(getFormat("higherLower").compare(pq, { kind: "hl", dir: "higher" }, { kind: "hl", dir: "lower" }).match).toBe(false);
  });
});

describe("scoring", () => {
  it("guessers +3 per match, target +2 per matcher", () => {
    const r = scoreQuestion({
      question: tilesQ,
      targetId: "t",
      participants: ["t", "a", "b", "c"],
      answers: {
        t: { kind: "option", optionId: "a1" },
        a: { kind: "option", optionId: "a1" },
        b: { kind: "option", optionId: "a1" },
        c: { kind: "option", optionId: "a0" },
      },
    });
    expect(r.perPlayer.a.coins).toBe(3);
    expect(r.perPlayer.c.coins).toBe(0);
    expect(r.perPlayer.t.coins).toBe(4);
    expect(r.matchedCount).toBe(2);
  });
  it("perfect number match gives +2 extra", () => {
    const r = scoreQuestion({
      question: numberQ,
      targetId: "t",
      participants: ["t", "a"],
      answers: { t: { kind: "number", value: 10 }, a: { kind: "number", value: 10 } },
    });
    expect(r.perPlayer.a.coins).toBe(5);
  });
  it("scale (1–10): exact 5, one off 3 (match), two off 1 (close), further 0", () => {
    const q: ResolvedQuestion = { ...numberQ, format: "scale", number: { min: 1, max: 10, step: 1, tolerance: { type: "absolute", value: 1 } } };
    const n = (value: number) => ({ kind: "number" as const, value });
    const r = scoreQuestion({
      question: q,
      targetId: "t",
      participants: ["t", "a", "b", "c", "d"],
      answers: { t: n(7), a: n(7), b: n(6), c: n(9), d: n(3) },
    });
    expect([r.perPlayer.a.coins, r.perPlayer.b.coins, r.perPlayer.c.coins, r.perPlayer.d.coins]).toEqual([5, 3, 1, 0]);
    expect([r.perPlayer.a.match, r.perPlayer.b.match, r.perPlayer.c.match]).toEqual([true, true, false]);
    expect(r.perPlayer.c.close).toBe(true);
    expect(r.perPlayer.d.close).toBe(false);
    expect(r.matchedCount).toBe(2); // close answers don't count as matches
    expect(r.perPlayer.t.coins).toBe(4);
  });
  it("scale with Wide Tolerance halves the distance", () => {
    const q: ResolvedQuestion = { ...numberQ, format: "scale", number: { min: 1, max: 10, step: 1, tolerance: { type: "absolute", value: 1 } } };
    const r = scoreQuestion({
      question: q,
      targetId: "t",
      participants: ["t", "a"],
      answers: { t: { kind: "number", value: 7 }, a: { kind: "number", value: 9 } },
      boosts: { a: { wide: true } },
    });
    expect(r.perPlayer.a).toMatchObject({ match: true, coins: 3 });
  });
  it("2 players: one guesser, same rules", () => {
    const r = scoreQuestion({
      question: tilesQ,
      targetId: "t",
      participants: ["t", "a"],
      answers: { t: { kind: "option", optionId: "a0" }, a: { kind: "option", optionId: "a0" } },
    });
    expect(r.guesserCount).toBe(1);
    expect(r.perPlayer.a.coins).toBe(3);
    expect(r.perPlayer.t.coins).toBe(2);
    expect(bonusRecipients(r, "t").sort()).toEqual(["a", "t"]);
  });
  it("target who didn't answer → nobody matches", () => {
    const r = scoreQuestion({ question: tilesQ, targetId: "t", participants: ["t", "a"], answers: { a: { kind: "option", optionId: "a0" } } });
    expect(r.matchedCount).toBe(0);
    expect(r.perPlayer.t.answer).toBeNull();
  });
  it("wide tolerance doubles the window for that player only", () => {
    const args = {
      question: numberQ,
      targetId: "t",
      participants: ["t", "a", "b"],
      answers: { t: { kind: "number" as const, value: 10 }, a: { kind: "number" as const, value: 14 }, b: { kind: "number" as const, value: 14 } },
    };
    const r = scoreQuestion({ ...args, boosts: { a: { wide: true } } });
    expect(r.perPlayer.a.match).toBe(true);
    expect(r.perPlayer.b.match).toBe(false);
  });
  it("Lucky Charm doubles that player's coins only", () => {
    const r = scoreQuestion({
      question: tilesQ,
      targetId: "t",
      participants: ["t", "a", "b"],
      answers: { t: { kind: "option", optionId: "a0" }, a: { kind: "option", optionId: "a0" }, b: { kind: "option", optionId: "a0" } },
      boosts: { a: { double: true } },
    });
    expect(r.perPlayer.a.coins).toBe(6);
    expect(r.perPlayer.b.coins).toBe(3);
  });
  it("data questions: truth from data, ×2, target +3 when right about themselves", () => {
    const q: ResolvedQuestion = { ...tilesQ, isData: true, truth: { kind: "option", optionId: "a2" } };
    const r = scoreQuestion({
      question: q,
      targetId: "t",
      participants: ["t", "a", "b"],
      multiplier: 2,
      answers: {
        t: { kind: "option", optionId: "a2" },
        a: { kind: "option", optionId: "a2" },
        b: { kind: "option", optionId: "a0" },
      },
    });
    expect(r.truthFrom).toBe("data");
    expect(r.perPlayer.a.coins).toBe(6);
    expect(r.perPlayer.t.coins).toBe(2 * 2 + 3);
    expect(r.targetSelfCorrect).toBe(true);
    const wrong = scoreQuestion({ question: q, targetId: "t", participants: ["t", "a"], multiplier: 2, answers: { t: { kind: "option", optionId: "a0" } } });
    expect(wrong.targetSelfCorrect).toBe(false);
  });
  it("bonus: target gets it when at least half the guessers matched", () => {
    const base = { question: tilesQ, targetId: "t", participants: ["t", "a", "b", "c"] };
    const t = { kind: "option" as const, optionId: "a1" };
    const no = { kind: "option" as const, optionId: "a0" };
    expect(bonusRecipients(scoreQuestion({ ...base, answers: { t, a: t, b: no, c: no } }), "t")).toEqual(["a"]);
    expect(bonusRecipients(scoreQuestion({ ...base, answers: { t, a: t, b: t, c: no } }), "t").sort()).toEqual(["a", "b", "t"]);
  });
});

describe("selection", () => {
  const settings = { familyFriendly: false, language: "en" as const };
  it("never repeats within a game until the pool is exhausted", () => {
    const rng = createRng(1);
    const history = { questionIds: [] as string[], lastThemeId: null as string | null };
    const seen = new Set<string>();
    const pool = content.packs.flatMap((p) => p.questions).filter((q) => !q.truthSource && q.usage.includes("tile")).length;
    for (let i = 0; i < pool; i++) {
      const s = selectQuestion({ content, settings, history, rng, usage: "tile", playerCount: 4 })!;
      expect(seen.has(s.question.id)).toBe(false);
      seen.add(s.question.id);
      history.questionIds.push(s.question.id);
    }
    expect(selectQuestion({ content, settings, history, rng, usage: "tile", playerCount: 4 })).not.toBeNull();
  });
  it("prefers questions not asked in earlier games of the room", () => {
    const rng = createRng(5);
    const tilePool = content.packs.flatMap((p) => p.questions).filter((q) => !q.truthSource && q.usage.includes("tile"));
    // Pretend an earlier game asked all but 5 questions.
    const recentIds = tilePool.slice(5).map((q) => q.id);
    const fresh = new Set(tilePool.slice(0, 5).map((q) => q.id));
    const history = { questionIds: [] as string[], lastThemeId: null as string | null };
    for (let i = 0; i < 5; i++) {
      const s = selectQuestion({ content, settings, history, rng, usage: "tile", playerCount: 4, recentIds })!;
      expect(fresh.has(s.question.id)).toBe(true);
      history.questionIds.push(s.question.id);
    }
    // Fresh ones used up: falls back to the ones asked longest ago, never this game's.
    const s = selectQuestion({ content, settings, history, rng, usage: "tile", playerCount: 4, recentIds })!;
    expect(history.questionIds).not.toContain(s.question.id);
    expect(recentIds.indexOf(s.question.id)).toBeLessThan(Math.ceil(recentIds.length / 3) + 1);
  });
  it("after the pool is exhausted, does not immediately repeat the latest questions", () => {
    const rng = createRng(6);
    const tilePool = content.packs.flatMap((p) => p.questions).filter((q) => !q.truthSource && q.usage.includes("tile"));
    const history = { questionIds: tilePool.map((q) => q.id), lastThemeId: null as string | null };
    const latest = new Set(history.questionIds.slice(-20));
    for (let i = 0; i < 20; i++) {
      const s = selectQuestion({ content, settings, history, rng, usage: "tile", playerCount: 4 })!;
      expect(latest.has(s.question.id)).toBe(false);
    }
  });
  it("avoids the same theme twice in a row", () => {
    const rng = createRng(2);
    const history = { questionIds: [] as string[], lastThemeId: null as string | null };
    for (let i = 0; i < 30; i++) {
      const s = selectQuestion({ content, settings, history, rng, usage: "tile", playerCount: 4 })!;
      expect(s.question.themes).not.toContain(history.lastThemeId);
      history.lastThemeId = s.question.themes[0];
      history.questionIds.push(s.question.id);
    }
  });
  it("family-friendly excludes spicy, pack filter works", () => {
    const rng = createRng(3);
    for (let i = 0; i < 50; i++) {
      const s = selectQuestion({
        content,
        settings: { ...settings, packs: ["core-hot-takes"], familyFriendly: true },
        history: { questionIds: [], lastThemeId: null },
        rng,
        usage: "tile",
        playerCount: 4,
      })!;
      expect(s.question.tags ?? []).not.toContain("spicy");
      expect(s.question.themes).toContain("hot-takes");
    }
  });
  it("resolves placeholders and shuffles answers the same for everyone", () => {
    const pack = content.packs.find((p) => p.id === "core-food")!;
    const q = pack.questions.find((x) => x.id === "food.last-meal")!;
    const r = resolveQuestion(q, pack, {
      targetId: "p1",
      names: { p1: "Alex", p2: "Sam" },
      participants: ["p1", "p2"],
      rng: createRng(5),
      language: "en",
      enabledThemes: ["food"],
    });
    expect(r.prompt).toContain("Alex");
    expect(r.prompt).not.toContain("{target}");
    expect(r.options!.map((o) => o.id).sort()).toEqual(["a0", "a1", "a2", "a3"]);
  });
  it("uses German text when available", () => {
    const pack = content.packs.find((p) => p.id === "core-food")!;
    const q = pack.questions.find((x) => x.id === "food.one-cuisine")!;
    const r = resolveQuestion(q, pack, {
      targetId: "p1",
      names: { p1: "Alex" },
      participants: ["p1"],
      rng: createRng(5),
      language: "de",
      enabledThemes: ["food"],
    });
    expect(r.prompt).toContain("Küche");
  });
});
