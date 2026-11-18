import { describe, expect, it } from "vitest";
import { gameClock, setPaused, tickGame } from "../src";
import { Harness } from "./helpers";

describe("pause", () => {
  it("stops the game clock and resumes where it stopped", () => {
    const h = new Harness(2);
    const real0 = 5_000_000;
    expect(gameClock(h.room, real0)).toBe(real0);
    h.room = setPaused(h.room, true, "p1", real0);
    expect(gameClock(h.room, real0 + 60_000)).toBe(real0);
    h.room = setPaused(h.room, false, "p1", real0 + 60_000);
    expect(h.g.pause).toBeNull();
    expect(h.g.clockOffsetMs).toBe(60_000);
    expect(gameClock(h.room, real0 + 61_000)).toBe(real0 + 1_000);
  });

  it("ignores ticks and blocks actions while paused", () => {
    const h = new Harness(2);
    const phase = h.g.phase;
    h.room = setPaused(h.room, true, "p1", h.now);
    h.now = (h.g.phaseEndsAt ?? h.now) + 999_999;
    expect(tickGame(h.room, h.ctx())).toBeNull();
    expect(h.g.phase).toBe(phase);
    expect(() => h.act({ type: "ready", playerId: "p1" })).toThrow(/paused/);
  });

  it("keeps the remaining time of the current phase across a pause", () => {
    const h = new Harness(2);
    const realStart = h.now;
    const left = h.g.phaseEndsAt! - gameClock(h.room, realStart);
    h.room = setPaused(h.room, true, "p1", realStart);
    h.room = setPaused(h.room, false, "p1", realStart + 30_000);
    expect(h.g.phaseEndsAt! - gameClock(h.room, realStart + 30_000)).toBe(left);
  });

  it("pausing twice or resuming an unpaused game changes nothing", () => {
    const h = new Harness(2);
    const once = setPaused(h.room, true, "p1", 10);
    expect(setPaused(once, true, "p1", 20)).toBe(once);
    expect(setPaused(h.room, false, "p1", 20)).toBe(h.room);
  });
});

describe("skip", () => {
  it("ignores a skip right after a screen appears, then allows it", () => {
    const h = new Harness(2);
    const phase = h.g.phase;
    h.act({ type: "continue" }, true);
    expect(h.g.phase).toBe(phase);
    h.now += 1500;
    h.act({ type: "continue" }, true);
    expect(h.g.phase).not.toBe(phase);
  });
});
