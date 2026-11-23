import { describe, expect, it } from "vitest";
import {
  GameError,
  addBot,
  applyGameAction,
  botActions,
  createRng,
  createRoom,
  newBotMemory,
  startGame,
  tickGame,
  updateSettings,
  type EngineContext,
  type RoomState,
} from "@party-game/shared";
import { content } from "../../shared/test/helpers";
import { MINIGAMES } from "../src/server";

/** A room full of bots, run by the same loop the server uses (tick, then bot moves). */
function botGame(opts: { bots: number; seed: number; boardId?: string; mode?: "board" | "minigameDebug"; minigameId?: string }) {
  const rng = createRng(opts.seed);
  let now = 1_000_000;
  let room: RoomState = createRoom("BOTS", now, content);
  for (let i = 0; i < opts.bots; i++) room = addBot(room, `b${i}`, now);
  room = updateSettings(room, { turnCount: 10, boardId: opts.boardId ?? "random" }, content);
  const ctx = (): EngineContext => ({ content, minigames: MINIGAMES, generators: {}, playerData: {}, rng, now });
  room = startGame(room, ctx(), opts.mode ?? "board", { minigameId: opts.minigameId }).room;
  const memo = newBotMemory();
  const phases: string[] = [];
  const step = (ms = 100) => {
    now += ms;
    const t = tickGame(room, ctx());
    if (t) room = t.room;
    for (const a of botActions(room, content, MINIGAMES, rng, now, memo)) {
      try {
        room = applyGameAction(room, a, ctx()).room;
      } catch (e) {
        if (!(e instanceof GameError)) throw e; // a real crash, not just a move that's no longer valid
      }
    }
    if (phases[phases.length - 1] !== room.game!.phase) phases.push(room.game!.phase);
  };
  return { step, get room() { return room; }, get now() { return now; }, phases };
}

describe("bots", () => {
  it("a game with only bots plays all the way to the podium", () => {
    for (const [seed, boardId] of [[1, "pit-stop"], [2, "casino-strip"], [3, "twin-islands"], [4, "classic"]] as const) {
      const g = botGame({ bots: 4, seed, boardId });
      for (let i = 0; i < 200_000 && g.room.game!.phase !== "podium"; i++) g.step();
      expect(g.room.game!.phase, `seed ${seed}`).toBe("podium");
      expect(g.phases).toContain("minigamePlaying");
      expect(g.phases).toContain("questionRound");
    }
  });

  it("bots act instead of waiting for timers", () => {
    const g = botGame({ bots: 3, seed: 7, boardId: "classic" });
    while (g.room.game!.phase !== "turnStart") g.step();
    const startedAt = g.now;
    while (g.room.game!.phase === "turnStart") g.step();
    expect(g.now - startedAt).toBeLessThan(3000); // the turn-start timer is 20 s
    expect(g.room.game!.phase).toBe("rolling");
  });

  it("every mini-game takes bot moves without crashing and finishes", () => {
    for (const id of Object.keys(MINIGAMES)) {
      const def = MINIGAMES[id];
      const n = Math.max(def.minPlayers, Math.min(4, def.maxPlayers ?? 4));
      const g = botGame({ bots: n, seed: 11, mode: "minigameDebug", minigameId: id });
      for (let i = 0; i < 20_000 && g.room.game!.phase !== "minigameResults"; i++) g.step();
      expect(g.room.game!.phase, id).toBe("minigameResults");
    }
  });
});
