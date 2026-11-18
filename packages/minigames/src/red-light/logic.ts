import { z } from "zod";
import { rankByScore, type MiniGameDefinition, type PlayerId } from "@party-game/shared";

export const FINISH = 100;
export const SPEED = 15; // units per second while holding
/** Grace after red before holding counts as moving (network latency). */
export const RED_GRACE_MS = 220;
export const WARNING_MS = 300;

type Light = "green" | "yellow" | "red";

export interface RedLightState {
  players: PlayerId[];
  bonuses: PlayerId[];
  pos: Record<PlayerId, number>;
  holding: Record<PlayerId, boolean>;
  light: Light;
  lightSince: number;
  /** When the current light ends (secret). */
  lightUntil: number;
  /** What comes after yellow: a real red, or a fake-out back to green (secret). */
  yellowLeadsTo: "red" | "green";
  /** When the next red starts (secret; for the bonus warning). */
  nextRedAt: number | null;
  finished: PlayerId[];
  caught: Record<PlayerId, number>;
  lastTick: number;
}

export interface RedLightPublic {
  pos: Record<PlayerId, number>;
  holding: Record<PlayerId, boolean>;
  light: Light;
  finished: PlayerId[];
  caught: Record<PlayerId, number>;
}

function scheduleGreen(s: RedLightState, now: number, rng: () => number): RedLightState {
  const greenFor = 1300 + rng() * 2700;
  const r = rng();
  // after green: real yellow→red (50%), fake-out yellow→green (25%), straight to red (25%)
  if (r < 0.5) return { ...s, light: "green", lightSince: now, lightUntil: now + greenFor, yellowLeadsTo: "red", nextRedAt: now + greenFor + 450 };
  if (r < 0.75) return { ...s, light: "green", lightSince: now, lightUntil: now + greenFor, yellowLeadsTo: "green", nextRedAt: null };
  return { ...s, light: "green", lightSince: now, lightUntil: now + greenFor, yellowLeadsTo: "red", nextRedAt: now + greenFor };
}

export const redLight: MiniGameDefinition<RedLightState, { hold: boolean }> = {
  id: "red-light",
  kind: "sharedRealtime",
  durationSec: 50,
  minPlayers: 2,
  inputSchema: z.object({ hold: z.boolean() }),
  init: ({ players, bonuses, now, rng }) =>
    scheduleGreen(
      {
        players,
        bonuses,
        pos: Object.fromEntries(players.map((p) => [p, 0])),
        holding: Object.fromEntries(players.map((p) => [p, false])),
        light: "green",
        lightSince: now,
        lightUntil: now,
        yellowLeadsTo: "red",
        nextRedAt: null,
        finished: [],
        caught: {},
        lastTick: now,
      },
      now,
      rng,
    ),
  onInput: (s, pid, input) => (s.finished.includes(pid) ? s : { ...s, holding: { ...s.holding, [pid]: input.hold } }),
  tick: (s0, { now, rng }) => {
    let s = { ...s0, pos: { ...s0.pos }, caught: { ...s0.caught } };
    const dt = Math.min(250, now - s.lastTick) / 1000;
    s.lastTick = now;
    // Light machine
    if (now >= s.lightUntil) {
      if (s.light === "green") {
        if (s.nextRedAt !== null && s.nextRedAt <= s.lightUntil + 1) {
          s = { ...s, light: "red", lightSince: now, lightUntil: now + 1200 + rng() * 1800, nextRedAt: null };
        } else {
          s = { ...s, light: "yellow", lightSince: now, lightUntil: now + 450 };
        }
      } else if (s.light === "yellow") {
        s = s.yellowLeadsTo === "red"
          ? { ...s, light: "red", lightSince: now, lightUntil: now + 1200 + rng() * 1800, nextRedAt: null }
          : scheduleGreen(s, now, rng);
      } else {
        s = scheduleGreen(s, now, rng);
      }
    }
    for (const pid of s.players) {
      if (s.finished.includes(pid) || !s.holding[pid]) continue;
      if (s.light === "red" && now - s.lightSince > RED_GRACE_MS) {
        s.pos[pid] = 0; // caught moving on red → back to start
        s.caught[pid] = (s.caught[pid] ?? 0) + 1;
        s.holding = { ...s.holding, [pid]: false };
        continue;
      }
      s.pos[pid] = Math.min(FINISH, s.pos[pid] + SPEED * dt);
      if (s.pos[pid] >= FINISH) s.finished = [...s.finished, pid];
    }
    return s;
  },
  // First to the finish wins (crossing in the same tick = shared win); everyone else by distance.
  isFinished: (s) => s.finished.length > 0 || s.players.every((p) => s.finished.includes(p)),
  results: (s) => {
    const score = Object.fromEntries(s.players.map((p) => [p, s.finished.includes(p) ? 1000 : Math.floor(s.pos[p])]));
    return rankByScore(s.players, score, true, (v) => (v >= 900 ? "Finished!" : `${v}%`));
  },
  publicState: (s): RedLightPublic => ({
    pos: Object.fromEntries(Object.entries(s.pos).map(([k, v]) => [k, Math.round(v * 10) / 10])),
    holding: s.holding,
    light: s.light,
    finished: s.finished,
    caught: s.caught,
  }),
  privateState: (s, pid, now) => {
    const bonus = s.bonuses.includes(pid);
    const redAt = s.light === "yellow" && s.yellowLeadsTo === "red" ? s.lightUntil : s.nextRedAt;
    return { bonus, warning: bonus && redAt !== null && redAt - now <= WARNING_MS && redAt - now > -50 };
  },
};
