import { fail } from "./errors";
import type { PlayerId, RoomState } from "./types";

/**
 * Pausing: every deadline in the game is an absolute timestamp on the *game clock*. The game clock is
 * real time minus the time spent paused, and it stands still while paused. So after a resume every
 * timer simply continues where it stopped; nothing has to be shifted.
 */
/** The running game, board or hub: both carry the same pause fields. */
function running(room: RoomState) {
  return room.game ?? room.hub ?? null;
}

export function gameClock(room: RoomState, realNow: number): number {
  const g = running(room);
  if (!g) return realNow;
  return (g.pause ? g.pause.since : realNow) - (g.clockOffsetMs ?? 0);
}

export function isPaused(room: RoomState): boolean {
  return !!running(room)?.pause;
}

/** Pause or resume the running game. Returns the new room (unchanged if already in that state). */
export function setPaused(room: RoomState, paused: boolean, by: PlayerId | null, realNow: number): RoomState {
  const g = running(room);
  if (!g || room.stage !== "game") fail("WRONG_PHASE", "There's no game to pause.");
  const over = room.game ? room.game.phase === "podium" : room.hub?.stage === "podium";
  if (over && paused) fail("WRONG_PHASE", "The game is already over.");
  if (paused === !!g.pause) return room;
  const key = room.game ? "game" : "hub";
  if (paused) return { ...room, [key]: { ...g, pause: { since: realNow, by } } };
  const pausedFor = Math.max(0, realNow - g.pause!.since);
  return { ...room, [key]: { ...g, pause: null, clockOffsetMs: (g.clockOffsetMs ?? 0) + pausedFor } };
}
