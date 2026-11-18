import { describe, expect, it } from "vitest";
import { GAME_CONFIG, updateSettings, createRoom } from "../src";
import { Harness, content } from "./helpers";

describe("unlimited rounds", () => {
  it("is an allowed setting", () => {
    expect(GAME_CONFIG.turns.options).toContain(0);
    expect(updateSettings(createRoom("ABCD", 0, content), { turnCount: 0 }, content).settings.turnCount).toBe(0);
  });

  it("keeps going past the usual limit until the host finishes it", () => {
    const h = new Harness(2, { seed: 5 });
    h.room = { ...h.room, game: { ...h.g, turnCount: 0 } };
    for (let i = 0; i < 20000 && h.g.round <= 3; i++) h.timeout();
    expect(h.g.round).toBeGreaterThan(3);
    expect(h.g.phase).not.toBe("gameEnd");
    expect(() => h.act({ type: "finish" }, false)).toThrow();
    h.act({ type: "finish" }, true);
    expect(h.g.phase).toBe("gameEnd");
    h.advanceTo("podium");
    expect(() => h.act({ type: "finish" }, true)).toThrow();
  });

  it("a finished game still ends normally with a limit", () => {
    const h = new Harness(2, { seed: 6 });
    h.room = { ...h.room, game: { ...h.g, turnCount: 1 } };
    h.advanceTo("gameEnd", 5000);
    expect(h.g.round).toBe(1);
  });
});
