import { describe, expect, it } from "vitest";
import {
  BLUFF,
  DATA_GENERATORS,
  SPECTRUM,
  addBot,
  applyHubAction,
  canStart,
  createRng,
  gameClock,
  hubBotActions,
  hubConnectionChange,
  newHubBotMemory,
  removePlayerFromHub,
  setPaused,
  setTeam,
  shuffleTeams,
  spectrumPoints,
  startHubGame,
  tickHub,
  toPrivateState,
  toPublicState,
  updateSettings,
  type BluffPrivate,
  type BluffPublic,
  type BluffState,
  type EngineContext,
  type HubAction,
  type HubGameId,
  type RoomState,
  type SpectrumPublic,
  type SpectrumState,
  type SpyPrivate,
  type SpyPublic,
  type SpyState,
} from "../src";
import { content, makeRoom } from "./helpers";

class HubHarness {
  now = 1_000_000;
  rng = createRng(7);
  room: RoomState;
  events: any[] = [];
  constructor(players: number, gameId: HubGameId, patch: Parameters<typeof updateSettings>[1] = {}, prep?: (r: RoomState) => RoomState) {
    let room = makeRoom(players, this.now);
    room = updateSettings(room, { gameId, ...patch }, content);
    room = { ...room, players: room.players.map((p) => ({ ...p, ready: true })) };
    if (prep) room = prep(room);
    this.room = startHubGame(room, this.ctx(), gameId).room;
  }
  ctx(): EngineContext {
    return { content, minigames: {}, generators: DATA_GENERATORS, playerData: {}, rng: this.rng, now: this.now };
  }
  get rt() {
    return this.room.hub!;
  }
  state<T>() {
    return this.rt.state as T;
  }
  act(a: HubAction, isHost = false) {
    const res = applyHubAction(this.room, a, this.ctx(), isHost);
    this.room = res.room;
    this.events.push(...res.events);
  }
  play(playerId: string, action: unknown) {
    this.act({ type: "game", playerId, action });
  }
  readyAll() {
    for (const p of this.rt.players) this.act({ type: "ready", playerId: p });
  }
  tick() {
    const res = tickHub(this.room, this.ctx());
    if (res) {
      this.room = res.room;
      this.events.push(...res.events);
    }
    return res;
  }
  /** Jump to the current deadline and tick. */
  timeout() {
    const st = this.rt.state as { phaseEndsAt: number | null };
    const end = this.rt.stage === "intro" ? this.rt.stageEndsAt : st.phaseEndsAt;
    if (end !== null) this.now = Math.max(this.now, end);
    return this.tick();
  }
  pub() {
    return toPublicState(this.room, {}, this.now);
  }
  priv(pid: string | null) {
    return toPrivateState(this.room, pid, {}, this.now);
  }
}

describe("hub rooms", () => {
  it("switches games and validates hub settings", () => {
    let room = makeRoom(3);
    expect(room.settings.gameId).toBe("party");
    room = updateSettings(room, { gameId: "spectrum", hub: { spectrum: { cluesEach: 3 } } }, content);
    expect(room.settings.gameId).toBe("spectrum");
    expect(room.settings.hub.spectrum.cluesEach).toBe(3);
    // Other games keep their settings.
    expect(room.settings.hub.spygrid.pace).toBe("normal");
    expect(() => updateSettings(room, { hub: { spectrum: { cluesEach: 9 } } }, content)).toThrow();
    expect(() => updateSettings(room, { gameId: "nope" as never }, content)).toThrow();
  });

  it("checks player counts and teams before starting", () => {
    let room = makeRoom(3);
    room = updateSettings(room, { gameId: "spygrid" }, content);
    room = { ...room, players: room.players.map((p) => ({ ...p, ready: true })) };
    expect(canStart(room)).toMatchObject({ ok: false });
    room = makeRoom(4);
    room = updateSettings(room, { gameId: "spygrid" }, content);
    room = { ...room, players: room.players.map((p) => ({ ...p, ready: true })) };
    expect(canStart(room)).toEqual({ ok: true });
    // Three on one team, one on the other: not playable.
    for (const id of ["p1", "p2", "p3"]) room = setTeam(room, id, { team: "a" });
    expect(canStart(room)).toMatchObject({ ok: false });
    room = shuffleTeams(room, createRng(1));
    expect(room.players.filter((p) => p.team === "a")).toHaveLength(2);
    expect(canStart(room)).toEqual({ ok: true });
  });

  it("allows one clue-giver per team", () => {
    let room = makeRoom(4);
    room = setTeam(room, "p1", { team: "a", clueGiver: true });
    room = setTeam(room, "p2", { team: "a" });
    expect(() => setTeam(room, "p2", { clueGiver: true })).toThrow();
    room = setTeam(room, "p1", { team: null });
    expect(room.players[0].clueGiver).toBe(false);
  });

  it("pauses the hub clock", () => {
    const h = new HubHarness(3, "spectrum");
    const paused = setPaused(h.room, true, "p1", h.now + 100);
    expect(gameClock(paused, h.now + 5000)).toBe(h.now + 100);
    expect(tickHub(paused, { ...h.ctx(), now: h.now + 999_999 })).toBeNull();
    const resumed = setPaused(paused, false, "p1", h.now + 5100);
    expect(resumed.hub!.clockOffsetMs).toBe(5000);
  });

  it("leaves the tutorial once everyone is ready", () => {
    const h = new HubHarness(3, "spectrum");
    expect(h.rt.stage).toBe("intro");
    h.act({ type: "ready", playerId: "p1" });
    expect(h.rt.stage).toBe("intro");
    h.readyAll();
    expect(h.rt.stage).toBe("playing");
  });
});

describe("Spy Grid", () => {
  function setup() {
    const h = new HubHarness(4, "spygrid", {}, (r) => {
      r = setTeam(r, "p1", { team: "a", clueGiver: true });
      r = setTeam(r, "p2", { team: "a" });
      r = setTeam(r, "p3", { team: "b", clueGiver: true });
      return setTeam(r, "p4", { team: "b" });
    });
    h.readyAll();
    return h;
  }
  const s = (h: HubHarness) => h.state<SpyState>();
  const giver = (h: HubHarness) => s(h).clueGivers[s(h).turn]!;
  const guesser = (h: HubHarness) => (s(h).turn === "a" ? "p2" : "p4");
  const cardOf = (h: HubHarness, kind: string) => s(h).cards.findIndex((c) => c.kind === kind && !c.revealed);

  it("deals 25 words: 9 + 8 agents, 1 trap", () => {
    const h = setup();
    const st = s(h);
    expect(st.cards).toHaveLength(25);
    expect(st.cards.filter((c) => c.kind === st.startTeam)).toHaveLength(9);
    expect(st.cards.filter((c) => c.kind === "trap")).toHaveLength(1);
    expect(st.turn).toBe(st.startTeam);
    expect(st.phase).toBe("clue");
  });

  it("only shows the key to clue-givers", () => {
    const h = setup();
    expect((h.priv("p1").hub as SpyPrivate).key).toHaveLength(25);
    expect((h.priv("p2").hub as SpyPrivate).key).toBeNull();
    expect((h.priv(null).hub as SpyPrivate).key).toBeNull();
    const pub = h.pub().hub!.state as SpyPublic;
    expect(pub.cards.every((c) => c.kind === null)).toBe(true);
  });

  it("rejects clues that are on the grid", () => {
    const h = setup();
    const word = s(h).cards[0].word;
    expect(() => h.play(giver(h), { type: "clue", word, count: 1 })).toThrow(/grid/);
    expect(() => h.play(giver(h), { type: "clue", word: "two words", count: 1 })).toThrow(/One word/);
    expect(() => h.play(guesser(h), { type: "clue", word: "zzzq", count: 1 })).toThrow();
  });

  it("reveals on a majority vote and continues on a hit", () => {
    const h = setup();
    const team = s(h).turn;
    h.play(giver(h), { type: "clue", word: "QWXZ", count: 2 });
    expect(s(h).phase).toBe("guess");
    expect(s(h).guessesLeft).toBe(3);
    const idx = cardOf(h, team);
    h.play(guesser(h), { type: "vote", index: idx });
    expect(s(h).cards[idx].revealed).toBe(true);
    expect(s(h).phase).toBe("guess");
    expect(s(h).guessesLeft).toBe(2);
    // A bystander ends the turn.
    h.play(guesser(h), { type: "vote", index: cardOf(h, "neutral") });
    expect(s(h).phase).toBe("turnEnd");
    h.timeout();
    expect(s(h).turn).not.toBe(team);
    expect(s(h).phase).toBe("clue");
  });

  it("loses on the trap", () => {
    const h = setup();
    const team = s(h).turn;
    h.play(giver(h), { type: "clue", word: "QWXZ", count: 1 });
    h.play(guesser(h), { type: "vote", index: cardOf(h, "trap") });
    expect(h.rt.stage).toBe("podium");
    expect(s(h).winner).not.toBe(team);
    expect(h.rt.results!.winners.every((p) => s(h).teams[p] !== team)).toBe(true);
    expect((h.pub().hub!.state as SpyPublic).cards.every((c) => c.kind !== null)).toBe(true);
  });

  it("wins by finding every agent", () => {
    const h = setup();
    const team = s(h).turn;
    h.play(giver(h), { type: "clue", word: "QWXZ", count: 0 });
    while (h.rt.stage === "playing") h.play(guesser(h), { type: "vote", index: cardOf(h, team) });
    expect(s(h).winner).toBe(team);
    expect(s(h).winReason).toBe("allFound");
    expect(h.rt.results!.teams!.find((t) => t.won)!.id).toBe(team);
  });

  it("passes the turn when time runs out", () => {
    const h = setup();
    const team = s(h).turn;
    h.timeout();
    expect(s(h).phase).toBe("turnEnd");
    h.timeout();
    expect(s(h).turn).not.toBe(team);
  });

  it("forfeits when a team is empty", () => {
    const h = setup();
    h.room = removePlayerFromHub(h.room, "p3", h.ctx()).room;
    expect(s(h).clueGivers.b).toBe("p4");
    h.room = removePlayerFromHub(h.room, "p4", h.ctx()).room;
    expect(h.rt.stage).toBe("podium");
    expect(s(h).winner).toBe("a");
  });
});

describe("Spectrum", () => {
  it("scores by distance and gives the clue-giver the average", () => {
    expect(spectrumPoints(0)).toBe(4);
    expect(spectrumPoints(8)).toBe(3);
    expect(spectrumPoints(14)).toBe(2);
    expect(spectrumPoints(15)).toBe(0);
    const h = new HubHarness(3, "spectrum", { hub: { spectrum: { cluesEach: 1 } } });
    h.readyAll();
    const st = () => h.state<SpectrumState>();
    expect(st().schedule).toHaveLength(3);
    const r = st().round!;
    const others = ["p1", "p2", "p3"].filter((p) => p !== r.giverId);
    // Only the clue-giver sees the target.
    expect((h.priv(r.giverId).hub as { target: number }).target).toBe(r.target);
    expect((h.priv(others[0]).hub as { target: number | null }).target).toBeNull();
    expect((h.pub().hub!.state as SpectrumPublic).round!.target).toBeNull();
    expect(() => h.play(r.giverId, { type: "clue", text: "about 40" })).toThrow(/numbers/);
    h.play(r.giverId, { type: "clue", text: "Lukewarm tea" });
    h.play(others[0], { type: "guess", value: r.target });
    h.play(others[1], { type: "draft", value: Math.min(100, r.target + 20) });
    h.timeout();
    expect(st().phase).toBe("reveal");
    expect(st().round!.points).toEqual({ [others[0]]: 4, [others[1]]: 0, [r.giverId]: 2 });
    h.timeout();
    expect(st().history).toHaveLength(1);
    expect(st().phase).toBe("clue");
  });

  it("waits for a guesser who is only refreshing the page", () => {
    const h = new HubHarness(2, "spectrum", { hub: { spectrum: { cluesEach: 1 } } });
    h.readyAll();
    const r = h.state<SpectrumState>().round!;
    const guesser = r.giverId === "p1" ? "p2" : "p1";
    h.play(r.giverId, { type: "clue", text: "Lukewarm" });
    // The guesser drops out (a refresh): no early reveal.
    h.room = { ...h.room, players: h.room.players.map((p) => (p.id === guesser ? { ...p, connected: false, disconnectedAt: h.now } : p)) };
    const res = hubConnectionChange(h.room, h.ctx());
    if (res) h.room = res.room;
    expect(h.state<SpectrumState>().phase).toBe("guess");
    h.now += 1000;
    h.tick();
    expect(h.state<SpectrumState>().phase).toBe("guess");
    // Gone for good: the game moves on without them.
    h.now += 5000;
    h.tick();
    expect(h.state<SpectrumState>().phase).toBe("reveal");
  });

  it("skips a round without a clue and finishes", () => {
    const h = new HubHarness(2, "spectrum", { hub: { spectrum: { cluesEach: 1 } } });
    h.readyAll();
    h.timeout();
    expect(h.state<SpectrumState>().history[0].skipped).toBe(true);
    h.timeout();
    expect(h.rt.stage).toBe("podium");
    expect(h.rt.results!.ranking).toHaveLength(2);
  });
});

describe("Bluff Club", () => {
  function setup(n = 4) {
    const h = new HubHarness(n, "bluff");
    h.readyAll();
    return h;
  }
  const st = (h: HubHarness) => h.state<BluffState>();

  it("builds answers from truth, fakes and house lies", () => {
    const h = setup(3);
    const r = st(h).round!;
    expect(r.prompt).not.toContain("{target}");
    const [a, b] = ["p1", "p2", "p3"].filter((p) => p !== r.targetId);
    h.play(r.targetId, { type: "write", text: "A purple llama" });
    h.play(a, { type: "write", text: "Space pirates" });
    h.play(b, { type: "write", text: "space PIRATES!" });
    expect(st(h).phase).toBe("vote");
    const entries = st(h).round!.entries;
    expect(entries.length).toBeGreaterThanOrEqual(BLUFF.minEntries);
    const fake = entries.find((e) => e.authors.length)!;
    expect(fake.authors.sort()).toEqual([a, b].sort());
    // The public state hides who wrote what.
    const pub = h.pub().hub!.state as BluffPublic;
    expect(pub.round!.entries.every((e) => e.truth === null && e.authors === null)).toBe(true);
    expect(() => h.play(a, { type: "vote", entryId: fake.id })).toThrow(/own/);
    expect(() => h.play(r.targetId, { type: "vote", entryId: fake.id })).toThrow();
  });

  it("scores truth, fooling, spotlight, mind readers and laughs", () => {
    const h = setup(4);
    const r = st(h).round!;
    const [a, b, c] = ["p1", "p2", "p3", "p4"].filter((p) => p !== r.targetId);
    h.play(r.targetId, { type: "write", text: "The Unsinkable Sock" });
    h.play(a, { type: "write", text: "the unsinkable sock" }); // mind reader
    h.play(b, { type: "write", text: "Captain Waffles" });
    h.play(c, { type: "write", text: "Moonbeam" });
    const round = st(h).round!;
    expect(round.mindReaders).toEqual([a]);
    expect(() => h.play(a, { type: "vote", entryId: round.entries[0].id })).toThrow();
    const truth = round.entries.find((e) => e.truth)!;
    const bFake = round.entries.find((e) => e.authors.includes(b))!;
    h.play(b, { type: "laugh", entryId: round.entries.find((e) => e.authors.includes(c))!.id });
    h.play(b, { type: "vote", entryId: truth.id });
    h.play(c, { type: "vote", entryId: bFake.id });
    expect(st(h).phase).toBe("reveal");
    const P = BLUFF.points;
    expect(st(h).round!.points).toEqual({
      [a]: P.mindReader,
      [b]: P.truth + P.fooled,
      [c]: P.laugh,
      [r.targetId]: P.spotlight,
    });
    expect((h.priv(b).hub as BluffPrivate).myVote).toBe(truth.id);
  });

  it("skips the round when the spotlight player writes nothing", () => {
    const h = setup(3);
    const first = st(h).round!.targetId;
    h.timeout();
    expect(st(h).history[0].skipped).toBe(true);
    expect(st(h).round!.targetId).not.toBe(first);
  });

  it("filters spicy prompts in family-friendly rooms", () => {
    const h = new HubHarness(3, "bluff", { familyFriendly: true, hub: { bluff: { roundsEach: 3 } } });
    expect(st(h).schedule.every((x) => !x.prompt.spicy)).toBe(true);
    expect(st(h).schedule).toHaveLength(9);
  });
});

describe("hub bots", () => {
  for (const gameId of ["spygrid", "spectrum", "bluff", "whowrote", "countup", "cluecrew", "oddword"] as const) {
    it(`bots play a whole game of ${gameId}`, () => {
      const h = new HubHarness(1, gameId, {}, (r) => {
        for (let i = 0; i < 4; i++) r = addBot(r, `bot${i}`, 0);
        return r;
      });
      const memo = newHubBotMemory();
      for (let i = 0; i < 4000 && h.rt.stage !== "podium"; i++) {
        h.now += 500;
        if (h.rt.stage === "intro") h.act({ type: "ready", playerId: "p1" });
        for (const a of hubBotActions(h.room, h.ctx(), memo)) {
          try {
            h.act(a);
          } catch {
            /* moved on */
          }
        }
        // The human never does anything: their timers run out.
        h.tick();
      }
      expect(h.rt.stage).toBe("podium");
      expect(h.rt.results!.ranking).toHaveLength(5);
      // Co-op: the crew can lose together (the human guesser never guesses here).
      if (gameId === "cluecrew" || gameId === "countup") expect(h.rt.results!.coop).toBeDefined();
      else expect(h.rt.results!.winners.length).toBeGreaterThan(0);
    });
  }
  void SPECTRUM;
});
