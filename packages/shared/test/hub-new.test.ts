import { describe, expect, it } from "vitest";
import {
  CLUECREW,
  DATA_GENERATORS,
  GAMES,
  COUNTUP,
  ODDWORD,
  WHOWROTE,
  addPlayer,
  addPlayerToHub,
  applyHubAction,
  hubBotActions,
  newHubBotMemory,
  createRng,
  crewClueProblem,
  crewGuessMatches,
  countLevels,
  removePlayerFromHub,
  startHubGame,
  tickHub,
  toPrivateState,
  toPublicState,
  updateSettings,
  type CrewPrivate,
  type CrewPublic,
  type CrewState,
  type EngineContext,
  type HubAction,
  type HubGameId,
  type CountPrivate,
  type CountPublic,
  type CountState,
  type OddPrivate,
  type OddPublic,
  type OddState,
  type RoomState,
  type WhoPrivate,
  type WhoPublic,
  type WhoState,
} from "../src";
import { content, makeRoom } from "./helpers";

class H {
  now = 1_000_000;
  rng = createRng(11);
  room: RoomState;
  constructor(players: number, gameId: HubGameId, patch: Parameters<typeof updateSettings>[1] = {}) {
    let room = makeRoom(players, this.now);
    room = updateSettings(room, { gameId, ...patch }, content);
    this.room = startHubGame(room, this.ctx(), gameId).room;
    for (const p of this.room.hub!.players) this.act({ type: "ready", playerId: p });
  }
  ctx(): EngineContext {
    return { content, minigames: {}, generators: DATA_GENERATORS, playerData: {}, rng: this.rng, now: this.now };
  }
  get rt() {
    return this.room.hub!;
  }
  st<T>() {
    return this.rt.state as T;
  }
  act(a: HubAction, isHost = false) {
    this.room = applyHubAction(this.room, a, this.ctx(), isHost).room;
  }
  play(playerId: string, action: unknown) {
    this.act({ type: "game", playerId, action });
  }
  timeout() {
    const end = (this.rt.state as { phaseEndsAt: number | null }).phaseEndsAt;
    if (end !== null) this.now = Math.max(this.now, end);
    const res = tickHub(this.room, this.ctx());
    if (res) this.room = res.room;
  }
  pub<T>() {
    return toPublicState(this.room, {}, this.now).hub!.state as T;
  }
  priv<T>(pid: string) {
    return toPrivateState(this.room, pid, {}, this.now).hub as T;
  }
}

describe("catalog", () => {
  it("tags every game with a play mode; Clue Crew is co-op", () => {
    for (const g of GAMES) expect(["ffa", "teams", "coop"]).toContain(g.mode);
    expect(GAMES.find((g) => g.id === "cluecrew")!.mode).toBe("coop");
    expect(GAMES.find((g) => g.id === "countup")!.mode).toBe("coop");
    expect(GAMES.find((g) => g.id === "oddword")!.mode).toBe("ffa");
    expect(GAMES).toHaveLength(8);
    expect(GAMES.find((g) => g.id === "spygrid")!.mode).toBe("teams");
  });
  it("validates the new lobby settings", () => {
    const room = makeRoom(3);
    expect(updateSettings(room, { gameId: "countup", hub: { countup: { levels: 10 } } }, content).settings.hub.countup.levels).toBe(10);
    expect(() => updateSettings(room, { hub: { countup: { levels: 5 } } }, content)).toThrow();
    expect(() => updateSettings(room, { hub: { oddword: { rounds: 4 } } }, content)).toThrow();
    expect(() => updateSettings(room, { hub: { cluecrew: { cards: 99 } } }, content)).toThrow();
    expect(() => updateSettings(room, { hub: { whowrote: { rounds: 0 } } }, content)).toThrow();
  });
});

describe("Count Up", () => {
  function setup(n = 3) {
    const h = new H(n, "countup");
    const s = () => h.st<CountState>();
    h.timeout(); // "get ready" is over
    return { h, s };
  }
  const deal = (s: CountState, hands: Record<string, number[]>) => {
    s.hands = hands;
  };

  it("caps levels so the deck never runs out", () => {
    expect(countLevels(10, 8)).toBe(10);
    expect(countLevels(10, 12)).toBe(8);
  });

  it("deals level-many secret cards and plays the lowest", () => {
    const { h, s } = setup(3);
    expect(s().phase).toBe("play");
    expect(h.priv<CountPrivate>("p1").hand).toHaveLength(1);
    expect(h.pub<CountPublic>().handCounts).toEqual({ p1: 1, p2: 1, p3: 1 });
    deal(s(), { p1: [10], p2: [20], p3: [30] });
    h.play("p1", { type: "play" });
    h.play("p2", { type: "play" });
    expect(s().pile.map((x) => x.card)).toEqual([10, 20]);
    h.play("p3", { type: "play" });
    expect(s().phase).toBe("clear");
    h.timeout();
    expect(s().level).toBe(2);
    expect(s().hands.p1).toHaveLength(2);
  });

  it("loses a life and throws away lower cards on a mistake", () => {
    const { h, s } = setup(3);
    const lives = s().lives;
    deal(s(), { p1: [40], p2: [5, 60], p3: [30] });
    h.play("p1", { type: "play" });
    expect(s().lives).toBe(lives - 1);
    expect(s().phase).toBe("oops");
    expect(s().mistake!.discarded).toEqual([
      { playerId: "p2", cards: [5] },
      { playerId: "p3", cards: [30] },
    ]);
    expect(() => h.play("p2", { type: "play" })).toThrow();
    h.timeout();
    h.play("p2", { type: "play" });
    expect(s().phase).toBe("clear");
  });

  it("syncs when everyone holding cards raises a hand", () => {
    const { h, s } = setup(3);
    deal(s(), { p1: [40, 50], p2: [5], p3: [] });
    expect(s().syncs).toBe(1);
    h.play("p1", { type: "raise", on: true });
    expect(s().phase).toBe("play");
    h.play("p2", { type: "raise", on: true });
    expect(s().syncs).toBe(0);
    expect(s().hands).toMatchObject({ p1: [50], p2: [] });
    expect(() => h.play("p1", { type: "raise", on: true })).toThrow();
  });

  it("loses the game when nobody plays for a minute", () => {
    const { h, s } = setup(3);
    deal(s(), { p1: [70], p2: [12], p3: [] });
    h.now += 30_000;
    h.play("p2", { type: "play" });
    // Each card played resets the clock.
    expect(s().phaseEndsAt).toBe(h.now + COUNTUP.idleMs);
    h.timeout();
    expect(h.rt.stage).toBe("podium");
    expect(s().lostBy).toBe("idle");
    expect(h.rt.results!.headline).toBe("Fell asleep");
  });

  it("ends as a co-op loss when the lives run out", () => {
    const { h, s } = setup(3);
    s().lives = 1;
    deal(s(), { p1: [90], p2: [5], p3: [] });
    h.play("p1", { type: "play" });
    expect(h.rt.stage).toBe("podium");
    expect(h.rt.results!.coop).toMatchObject({ score: 0 });
    expect(h.rt.results!.winners).toEqual([]);
  });
});

describe("Odd Word Out", () => {
  function setup(n = 4) {
    const h = new H(n, "oddword");
    const s = () => h.st<OddState>();
    const r = () => s().round!;
    const giveClues = () => {
      let i = 0;
      while (s().phase === "clue") h.play(r().order[r().turn % r().order.length], { type: "clue", text: `xclue${i++}q` });
    };
    return { h, s, r, giveClues };
  }

  it("gives one player a different word, secretly", () => {
    const { h, r } = setup(4);
    const words = ["p1", "p2", "p3", "p4"].map((p) => h.priv<OddPrivate>(p).word);
    expect(new Set(words).size).toBe(2);
    expect(h.priv<OddPrivate>(r().oddId).word).toBe(r().oddWord);
    const pub = h.pub<OddPublic>();
    expect(pub.round!.oddId).toBeNull();
    expect(pub.round!.crowdWord).toBeNull();
  });

  it("takes clues in turn, two laps, and rejects the own word", () => {
    const { h, s, r, giveClues } = setup(4);
    const first = r().order[0];
    expect(() => h.play(r().order[1], { type: "clue", text: "hello" })).toThrow(/turn/);
    expect(() => h.play(first, { type: "clue", text: h.priv<OddPrivate>(first).word! })).toThrow(/secret/);
    giveClues();
    expect(r().clues).toHaveLength(4 * ODDWORD.laps);
    expect(s().phase).toBe("vote");
  });

  it("catches the odd one out; they can steal with the right guess", () => {
    const { h, s, r, giveClues } = setup(4);
    giveClues();
    const odd = r().oddId;
    const others = s().players.filter((p) => p !== odd);
    for (const p of others) h.play(p, { type: "vote", playerId: odd });
    h.play(odd, { type: "vote", playerId: others[0] });
    expect(s().phase).toBe("lastchance");
    expect(h.pub<OddPublic>().round!.oddId).toBe(odd);
    h.play(odd, { type: "guess", text: r().crowdWord });
    expect(s().phase).toBe("result");
    expect(s().scores[odd]).toBe(ODDWORD.points.stolen);
    for (const p of others) expect(s().scores[p]).toBe(ODDWORD.points.caught);
  });

  it("lets the odd one out get away on a tie", () => {
    const { h, s, r, giveClues } = setup(4);
    giveClues();
    const odd = r().oddId;
    const [a, b, c] = s().players.filter((p) => p !== odd);
    h.play(a, { type: "vote", playerId: b });
    h.play(b, { type: "vote", playerId: a });
    h.play(c, { type: "vote", playerId: odd });
    h.play(odd, { type: "vote", playerId: c });
    expect(s().phase).toBe("result");
    expect(r().accusedId).toBeNull();
    expect(s().scores[odd]).toBe(ODDWORD.points.survived);
  });

  it("skips the turn of a player who runs out of time", () => {
    const { h, r } = setup(4);
    h.timeout();
    expect(r().clues[0].text).toBeNull();
    expect(r().turn).toBe(1);
  });
});

describe("Who Wrote That?", () => {
  it("guesses each anonymous answer and scores authors and guessers", () => {
    const h = new H(3, "whowrote");
    const s = () => h.st<WhoState>();
    h.play("p1", { type: "write", text: "Juggling spoons" });
    h.play("p2", { type: "write", text: "Whistling backwards" });
    expect(s().phase).toBe("write");
    h.play("p3", { type: "write", text: "Licking my elbow" });
    expect(s().phase).toBe("guess");
    const author = s().round!.order[0];
    const pub = h.pub<WhoPublic>();
    expect(pub.round!.current!.authorId).toBeNull();
    expect(h.priv<WhoPrivate>(author).isMine).toBe(true);
    const [g1, g2] = ["p1", "p2", "p3"].filter((p) => p !== author);
    expect(() => h.play(author, { type: "guess", playerId: g1 })).toThrow(/yours/);
    expect(() => h.play(g1, { type: "guess", playerId: g1 })).toThrow();
    h.play(g1, { type: "laugh", on: true });
    h.play(g1, { type: "guess", playerId: author });
    h.play(g2, { type: "guess", playerId: g1 });
    expect(s().phase).toBe("result");
    expect(s().scores[g1]).toBe(WHOWROTE.points.correct);
    expect(s().scores[author]).toBe(WHOWROTE.points.fooled + WHOWROTE.points.laugh);
    expect(h.pub<WhoPublic>().round!.current!.authorId).toBe(author);
    h.timeout();
    expect(s().phase).toBe("guess");
    expect(s().round!.cursor).toBe(1);
  });

  it("skips a prompt with fewer than two answers", () => {
    const h = new H(3, "whowrote", { hub: { whowrote: { rounds: 2 } } });
    h.play("p1", { type: "write", text: "Only me" });
    h.timeout();
    expect(h.st<WhoState>().history[0].skipped).toBe(true);
    expect(h.st<WhoState>().round!.index).toBe(1);
  });

  it("filters spicy prompts in family-friendly rooms", () => {
    const h = new H(3, "whowrote", { familyFriendly: true, hub: { whowrote: { rounds: 4 } } });
    expect(h.st<WhoState>().prompts.every((p) => !p.spicy)).toBe(true);
  });

  it("moves on when the author of the current answer leaves", () => {
    const h = new H(4, "whowrote");
    for (const p of ["p1", "p2", "p3", "p4"]) h.play(p, { type: "write", text: `Answer of ${p}` });
    const author = h.st<WhoState>().round!.order[0];
    h.room = removePlayerFromHub(h.room, author, h.ctx()).room;
    expect(h.st<WhoState>().phase).toBe("guess");
    expect(h.st<WhoState>().round!.cursor).toBe(1);
  });
});

describe("Clue Crew", () => {
  function setup(n = 4) {
    const h = new H(n, "cluecrew", { hub: { cluecrew: { cards: 7 } } });
    const s = () => h.st<CrewState>();
    const givers = () => s().players.filter((p) => p !== s().card!.guesserId);
    return { h, s, givers };
  }

  it("checks clues and guesses", () => {
    expect(crewClueProblem("two words", "OCEAN")).toMatch(/One word/);
    expect(crewClueProblem("oceans", "OCEAN")).toMatch(/secret/);
    expect(crewClueProblem("sea", "OCEAN")).toBe("");
    expect(crewGuessMatches("Oceans", "OCEAN")).toBe(true);
    expect(crewGuessMatches("ocaen", "OCEAN")).toBe(false);
    expect(crewGuessMatches("ocan", "OCEAN")).toBe(true);
    expect(crewGuessMatches("cat", "BAT")).toBe(false);
  });

  it("cancels identical clues and never shows the word to the guesser", () => {
    const { h, s, givers } = setup(4);
    const word = s().card!.word;
    const guesser = s().card!.guesserId;
    expect(h.priv<CrewPrivate>(guesser).word).toBeNull();
    expect(h.priv<CrewPrivate>(givers()[0]).word).toBe(word);
    expect(h.pub<CrewPublic>().card!.word).toBeNull();
    const [a, b, c] = givers();
    h.play(a, { type: "clue", texts: ["zebra"] });
    h.play(b, { type: "clue", texts: ["Zebras"] });
    h.play(c, { type: "clue", texts: ["quokka"] });
    expect(s().phase).toBe("check");
    expect(h.pub<CrewPublic>().card!.clues).toBeNull();
    const check = h.priv<CrewPrivate>(a).check!;
    expect(check.filter((x) => x.cancelled === "dup")).toHaveLength(2);
    expect(() => h.play(guesser, { type: "ok" })).toThrow();
    for (const p of [a, b, c]) h.play(p, { type: "ok" });
    expect(s().phase).toBe("guess");
    const pub = h.pub<CrewPublic>();
    expect(pub.card!.clues!.map((x) => x.text)).toEqual(["quokka"]);
    expect(pub.card!.cancelledCount).toBe(2);
    h.play(guesser, { type: "guess", text: word.toLowerCase() });
    expect(s().phase).toBe("result");
    expect(h.pub<CrewPublic>().card!.clues).toHaveLength(3);
    h.timeout();
    expect(s().score).toBe(1);
    expect(s().card!.guesserId).not.toBe(guesser);
  });

  it("burns the next card on a wrong guess, unless a clue-giver counts it", () => {
    const { h, s, givers } = setup(4);
    const play = (guess: string) => {
      for (const p of givers()) h.play(p, { type: "clue", texts: [`clue${p.slice(1)}x`] });
      for (const p of givers()) h.play(p, { type: "ok" });
      h.play(s().card!.guesserId, { type: "guess", text: guess });
    };
    play("definitelywrong");
    expect(h.pub<CrewPublic>().card!.burnsNext).toBe(true);
    h.timeout();
    expect(s().burned).toHaveLength(1);
    expect(s().deck).toHaveLength(6);
    play("definitelywrong");
    h.play(givers()[0], { type: "accept" });
    h.timeout();
    expect(s().score).toBe(1);
    expect(s().burned).toHaveLength(1);
  });

  it("gives two clues each with three players", () => {
    const { h, s, givers } = setup(3);
    const [a] = givers();
    expect(() => h.play(a, { type: "clue", texts: ["one"] })).toThrow(/2 clues/);
    expect(() => h.play(a, { type: "clue", texts: ["same", "same"] })).toThrow(/same/);
    h.play(a, { type: "clue", texts: ["alpha", "beta"] });
    expect(s().card!.written[a]).toHaveLength(2);
    void CLUECREW;
  });

  it("ends with a co-op result for everyone", () => {
    const { h, s } = setup(3);
    for (let i = 0; i < 200 && h.rt.stage === "playing"; i++) h.timeout();
    expect(h.rt.stage).toBe("podium");
    const r = h.rt.results!;
    expect(r.coop).toMatchObject({ score: 0, total: 7 });
    expect(r.ranking.every((x) => x.rank === 1)).toBe(true);
    expect(r.winners).toEqual([]);
    expect(s().history.every((c) => c.outcome === "pass")).toBe(true);
  });
});

describe("joining the newer games mid-game", () => {
  for (const gameId of ["whowrote", "oddword", "cluecrew", "countup"] as const) {
    it(`${gameId}: a late joiner gets a seat and the game still finishes`, () => {
      const h = new H(4, gameId);
      h.room = addPlayer(h.room, { id: "late", name: "Late", now: h.now });
      h.room = addPlayerToHub(h.room, "late", h.ctx()).room;
      expect((h.rt.state as { players: string[] }).players).toContain("late");
      // Everyone becomes a bot so the game plays itself out.
      h.room = { ...h.room, players: h.room.players.map((p) => ({ ...p, bot: true })) };
      const memo = newHubBotMemory();
      for (let i = 0; i < 6000 && h.rt.stage !== "podium"; i++) {
        h.now += 500;
        for (const a of hubBotActions(h.room, h.ctx(), memo)) {
          try {
            h.act(a);
          } catch {
            /* moved on */
          }
        }
        const res = tickHub(h.room, h.ctx());
        if (res) h.room = res.room;
      }
      expect(h.rt.stage).toBe("podium");
      expect(h.rt.results!.ranking.map((r) => r.playerId)).toContain("late");
    });
  }
  it("Odd Word Out adds a round with the newcomer as the odd one out", () => {
    const h = new H(4, "oddword");
    const before = h.st<OddState>().schedule.length;
    h.room = addPlayer(h.room, { id: "late", name: "Late", now: h.now });
    h.room = addPlayerToHub(h.room, "late", h.ctx()).room;
    expect(h.st<OddState>().schedule).toHaveLength(before + 1);
    expect(h.st<OddState>().schedule.at(-1)!.oddId).toBe("late");
  });
});
