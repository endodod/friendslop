import { describe, expect, it } from "vitest";
import {
  addCustomQuestion,
  buildCustomQuestion,
  computeTileTypes,
  createRng,
  pickRoundMinigame,
  getBoard,
  removeCustomQuestion,
  selectQuestion,
  updateSettings,
  withCustomPack,
  GAME_CONFIG,
  startGame,
} from "../src";
import { Harness, content, makeRoom } from "./helpers";

const count = (types: Record<string, string>, t: string) => Object.values(types).filter((x) => x === t).length;

describe("tile mix", () => {
  const board = getBoard(content, "classic");
  const base = Object.fromEntries(board.tiles.map((t) => [t.id, t.type]));

  it("normal keeps the board as designed", () => {
    expect(computeTileTypes(board, content, {}, createRng(1))).toEqual(base);
  });
  it("off removes a tile type (turned into blue)", () => {
    const t = computeTileTypes(board, content, { red: "off", question: "off" }, createRng(1));
    expect(count(t, "red")).toBe(0);
    expect(count(t, "question")).toBe(0);
    expect(count(t, "blue")).toBe(count(base, "blue") + count(base, "red") + count(base, "question"));
  });
  it("few halves, many adds — but keeps enough blue tiles for the star", () => {
    const few = computeTileTypes(board, content, { question: "few" }, createRng(2));
    expect(count(few, "question")).toBe(count(base, "question") - Math.round(count(base, "question") * 0.5));
    const many = computeTileTypes(board, content, { question: "many", lucky: "many", thief: "many", red: "many" }, createRng(3));
    expect(count(many, "question")).toBeGreaterThan(count(base, "question"));
    expect(count(many, "blue")).toBeGreaterThanOrEqual(GAME_CONFIG.tiles.minFillerTiles);
  });
  it("many adds a type the board doesn't have", () => {
    const t = computeTileTypes(board, content, { data: "many", event: "off" }, createRng(4));
    expect(count(t, "event")).toBe(0);
    expect(count(t, "data")).toBe(count(base, "data")); // data isn't tunable
  });
  it("settings validation drops unknown or untunable entries", () => {
    const room = makeRoom(2);
    const next = updateSettings(room, { tileFrequency: { red: "off", blue: "off", nope: "many" } as never }, content);
    expect(next.settings.tileFrequency).toEqual({ red: "off" });
  });
});

describe("question packs", () => {
  it("only enabled packs are used", () => {
    const rng = createRng(5);
    for (let i = 0; i < 40; i++) {
      const s = selectQuestion({
        content,
        settings: { familyFriendly: false, language: "en", packs: ["core-league"] },
        history: { questionIds: [], lastThemeId: null },
        rng,
        usage: "tile",
        playerCount: 4,
      })!;
      expect(s.pack.id).toBe("core-league");
    }
  });
  it("needs at least one pack", () => {
    expect(() => updateSettings(makeRoom(2), { packs: [] }, content)).toThrow(/at least one/);
  });
});

describe("custom questions", () => {
  it("builds valid questions for every format", () => {
    expect(buildCustomQuestion({ format: "tiles", prompt: "Best snack for {target}?", answers: ["Chips", "Fruit"] }, "custom.a").format).toBe("tiles");
    const n = buildCustomQuestion({ format: "number", prompt: "How tall is {target}?", min: 140, max: 210, unit: "cm" }, "custom.b");
    expect(n.number!.tolerance).toEqual({ type: "relative", value: 0.2 });
    const s = buildCustomQuestion({ format: "scale", prompt: "How sleepy is {target}?", minLabel: "awake", maxLabel: "asleep" }, "custom.c");
    expect(s.scaleLabels).toEqual({ min: "awake", max: "asleep" });
    expect(buildCustomQuestion({ format: "player", prompt: "Who is {target}'s best friend?" }, "custom.d").format).toBe("player");
  });
  it("rejects questions without {target}, bad placeholders or duplicate answers", () => {
    expect(() => buildCustomQuestion({ format: "player", prompt: "Who is the best?" }, "x")).toThrow(/\{target\}/);
    expect(() => buildCustomQuestion({ format: "player", prompt: "{target} vs {bob}?" }, "x")).toThrow(/placeholder/);
    expect(() => buildCustomQuestion({ format: "tiles", prompt: "{target}?", answers: ["A", "a"] }, "x")).toThrow(/different/);
  });
  it("is added to the room, picked in games, and removable by author or host", () => {
    let room = makeRoom(3);
    const [host, author, other] = room.players.map((p) => p.id);
    room = { ...room, hostId: host };
    room = addCustomQuestion(room, { id: author, name: "Sam" }, { format: "tiles", prompt: "What does {target} order at 2 AM?", answers: ["Kebab", "Pizza"] }, "custom.1");
    expect(() =>
      addCustomQuestion(room, { id: author, name: "Sam" }, { format: "tiles", prompt: "What does {target} order at 2 AM?", answers: ["X", "Y"] }, "custom.2"),
    ).toThrow(/already/);
    // Only the custom pack enabled → every question comes from it.
    room = updateSettings(room, { packs: ["custom"] }, content);
    const sel = selectQuestion({
      content: withCustomPack(content, room),
      settings: room.settings,
      history: { questionIds: [], lastThemeId: null },
      rng: createRng(1),
      usage: "tile",
      playerCount: 3,
    })!;
    expect(sel.question.id).toBe("custom.1");
    expect(() => removeCustomQuestion(room, { playerId: other, isHost: false }, "custom.1")).toThrow();
    expect(removeCustomQuestion(room, { playerId: author, isHost: false }, "custom.1").customQuestions).toHaveLength(0);
    expect(removeCustomQuestion(room, { playerId: host, isHost: true }, "custom.1").customQuestions).toHaveLength(0);
  });
});

describe("maps", () => {
  for (const board of content.boards) {
    it(`${board.id}: a whole game can be played`, () => {
      const h = new Harness(3, { seed: 9 });
      // restart on this board
      h.room = { ...h.room, stage: "lobby", game: null, settings: { ...h.room.settings, boardId: board.id } };
      const res = startGame(h.room, h.ctx(), "board");
      h.room = res.room;
      h.room.game!.turnCount = 3;
      let guard = 0;
      while (h.g.phase !== "podium" && guard++ < 3000) h.timeout();
      expect(h.g.phase).toBe("podium");
      expect(h.g.boardId).toBe(board.id);
    });
  }
});

describe("mini-game mix", () => {
  const pool = ["a", "b", "c", "d"].map((id) => ({ id, weight: 1 }));
  it("never picks games set to off; every game once per cycle; 'many' games come first", () => {
    const rng = createRng(4);
    const history = { minigamesPlayed: [] as string[] };
    const seen: string[] = [];
    for (let i = 0; i < 300; i++) seen.push(pickRoundMinigame(pool, { a: "off", b: "many", c: "few" }, history, rng)!.id);
    expect(seen).not.toContain("a");
    // Cycles of 3 (b, c, d): no repeats inside a cycle.
    for (let i = 0; i + 3 <= seen.length; i += 3) expect(new Set(seen.slice(i, i + 3)).size).toBe(3);
    // "many" usually opens a cycle, "few" usually closes it.
    const firsts = Array.from({ length: 100 }, (_, k) => seen[k * 3]);
    expect(firsts.filter((x) => x === "b").length).toBeGreaterThan(firsts.filter((x) => x === "c").length);
    for (let i = 1; i < seen.length; i++) expect(seen[i]).not.toBe(seen[i - 1]);
  });
  it("in a real game every mini-game comes up once before any repeats", () => {
    const rng = createRng(9);
    const pool = Array.from({ length: 30 }, (_, i) => ({ id: `g${i}`, weight: i < 4 ? 2 : 1 }));
    const history = { minigamesPlayed: [] as string[] };
    const first30 = Array.from({ length: 30 }, () => pickRoundMinigame(pool, {}, history, rng)!.id);
    expect(new Set(first30).size).toBe(30);
  });
  it("settings drop unknown games and refuse turning everything off", () => {
    const room = makeRoom(2);
    const next = updateSettings(room, { minigameMix: { "red-light": "many", nope: "off", stacker: "normal" } as never }, content);
    expect(next.settings.minigameMix).toEqual({ "red-light": "many" });
    const allOff = Object.fromEntries(content.minigames.filter((m) => m.enabled && m.id !== "duel").map((m) => [m.id, "off"]));
    expect(() => updateSettings(room, { minigameMix: allOff as never }, content)).toThrow(/at least one/);
  });
});

describe("default packs", () => {
  it("niche packs (League, Spicy) start switched off; everything else on", async () => {
    const { defaultSettings, selectablePacks } = await import("../src");
    const { content } = await import("./helpers");
    const s = defaultSettings(content);
    expect(s.packs).not.toContain("core-league");
    expect(s.packs).toContain("core-party");
    const off = selectablePacks(content).filter((p) => !s.packs.includes(p.id)).map((p) => p.id);
    expect(off).toEqual(["core-league", "core-spicy"]);
  });
});
