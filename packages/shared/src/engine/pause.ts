import { fail } from "./errors";
import type { PlayerId, RoomState } from "./types";

/**
 * Pausing: every deadline in the game is an absolute timestamp on the *game clock*. The game clock is
 * real time minus the time spent paused, and it stands still while paused. So after a resume every
 * timer simply continues where it stopped; nothing has to be shifted.
 */
export function gameClock(room: RoomState, realNow: number): number {
  const g = room.game;
  if (!g) return realNow;
  return (g.pause ? g.pause.since : realNow) - (g.clockOffsetMs ?? 0);
}

export function isPaused(room: RoomState): boolean {
  return !!room.game?.pause;
}

/** Pause or resume the running game. Returns the new room (unchanged if already in that state). */
export function setPaused(room: RoomState, paused: boolean, by: PlayerId | null, realNow: number): RoomState {
  const g = room.game;
  if (!g || room.stage !== "game") fail("WRONG_PHASE", "There's no game to pause.");
  if (g.phase === "podium" && paused) fail("WRONG_PHASE", "The game is already over.");
  if (paused === !!g.pause) return room;
  if (paused) return { ...room, game: { ...g, pause: { since: realNow, by } } };
  const pausedFor = Math.max(0, realNow - g.pause!.since);
  return { ...room, game: { ...g, pause: null, clockOffsetMs: (g.clockOffsetMs ?? 0) + pausedFor } };
}
