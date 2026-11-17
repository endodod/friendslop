import { loadContent } from "../../content/src/node";
import {
  addPlayer,
  createRng,
  createRoom,
  startGame,
  tickGame,
  applyGameAction,
  type EngineContext,
  type GameAction,
  type MinigameRegistry,
  type RoomState,
  type PlayerDataBundle,
  DATA_GENERATORS,
} from "../src";

export const content = loadContent();

export function makeRoom(n: number, now = 1_000_000): RoomState {
  let room = createRoom("TEST", now, content);
  const names = ["Alex", "Sam", "Jo", "Kim", "Lee", "Max", "Nia", "Ola"];
  for (let i = 0; i < n; i++) room = addPlayer(room, { id: `p${i + 1}`, name: names[i], now });
  return { ...room, players: room.players.map((p) => ({ ...p, ready: true })) };
}

export class Harness {
  now: number;
  rng: () => number;
  room: RoomState;
  events: any[] = [];
  constructor(
    players: number,
    public opts: { seed?: number; minigames?: MinigameRegistry; playerData?: Record<string, PlayerDataBundle>; mode?: "board" | "questionDebug" } = {},
  ) {
    this.now = 1_000_000;
    this.rng = createRng(opts.seed ?? 42);
    this.room = makeRoom(players, this.now);
    const res = startGame(this.room, this.ctx(), opts.mode ?? "board");
    this.room = res.room;
  }
  ctx(): EngineContext {
    return {
      content,
      minigames: this.opts.minigames ?? {},
      generators: DATA_GENERATORS,
      playerData: this.opts.playerData ?? {},
      rng: this.rng,
      now: this.now,
    };
  }
  get g() {
    return this.room.game!;
  }
  act(a: GameAction, isHost = false) {
    const res = applyGameAction(this.room, a, this.ctx(), isHost);
    this.room = res.room;
    this.events.push(...res.events);
    return res;
  }
  /** Jump to the current phase deadline and tick. */
  timeout() {
    if (this.g.phaseEndsAt !== null) this.now = Math.max(this.now, this.g.phaseEndsAt);
    const res = tickGame(this.room, this.ctx());
    if (res) {
      this.room = res.room;
      this.events.push(...res.events);
    }
    return res;
  }
  /** Tick at the current time (no jump). */
  tick() {
    const res = tickGame(this.room, this.ctx());
    if (res) {
      this.room = res.room;
      this.events.push(...res.events);
    }
    return res;
  }
  advanceTo(phase: string, max = 500) {
    for (let i = 0; i < max && this.g.phase !== phase; i++) this.timeout();
    if (this.g.phase !== phase) throw new Error(`never reached ${phase}, stuck in ${this.g.phase}`);
  }
  active() {
    return this.g.order[this.g.activeIndex];
  }
}
