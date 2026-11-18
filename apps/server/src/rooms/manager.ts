import { randomBytes } from "node:crypto";
import type { Server, Socket } from "socket.io";
import {
  CHAT_HISTORY,
  GAME_CONFIG,
  sanitizeChat,
  type ChatMessage,
  GameError,
  addPlayer,
  addCustomQuestion,
  removeCustomQuestion,
  type CustomQuestionDraft,
  applyGameAction,
  assertHost,
  canStart,
  createRng,
  createRoom,
  fail,
  generateRoomCode,
  onConnectionChange,
  randomSeed,
  removePlayer,
  removePlayerFromGame,
  setPlayerProfile,
  startGame,
  tickGame,
  gameClock,
  setPaused,
  toPrivateState,
  toPublicState,
  updatePlayer,
  updateSettings,
  type ContentBundle,
  type DataQuestionGenerator,
  type EngineContext,
  type EngineResult,
  type GameAction,
  type GameEvent,
  type MinigameRegistry,
  type Rng,
  type RoomSettings,
  type RoomState,
  type ServerToClientEvents,
} from "@party-game/shared";
import { env } from "../config";
import { InMemoryRoomStore, type RoomRecord, type RoomStore, type Seat } from "./roomStore";
import { persistence } from "../persistence/hooks";

export interface SocketData {
  code?: string;
  token?: string;
  role?: "player" | "display";
  playerId?: string | null;
}

type IoServer = Server<any, ServerToClientEvents, any, SocketData>;
type IoSocket = Socket<any, ServerToClientEvents, any, SocketData>;

interface LiveRoom extends RoomRecord {
  rng: Rng;
  lastPublic: string;
  lastPrivate: Map<string, string>;
  /** Recent chat (not part of the game state, never persisted). */
  chat?: ChatMessage[];
  lastChatAt?: Map<string, number>;
}

const CHAT_MIN_INTERVAL_MS = 600;
const LOBBY_DISCONNECT_REMOVE_MS = 3 * 60 * 1000;

export class RoomManager {
  private store: RoomStore = new InMemoryRoomStore();

  constructor(
    private io: IoServer,
    private content: ContentBundle,
    private minigames: MinigameRegistry,
    private generators: Record<string, DataQuestionGenerator>,
  ) {}

  // -------------------------------------------------------------------------
  // Lookup & context
  // -------------------------------------------------------------------------
  get(code: string): LiveRoom {
    const rec = this.store.get(code.toUpperCase()) as LiveRoom | undefined;
    if (!rec) fail("ROOM_NOT_FOUND", "Room not found. Check the code?");
    return rec;
  }

  tryGet(code: string): LiveRoom | undefined {
    return this.store.get(code.toUpperCase()) as LiveRoom | undefined;
  }

  ctx(rec: LiveRoom): EngineContext {
    return {
      content: this.content,
      minigames: this.minigames,
      generators: this.generators,
      playerData: rec.playerData,
      rng: rec.rng,
      // The game clock stands still while the host has paused the game.
      now: gameClock(rec.room, Date.now()),
    };
  }

  private newToken(): string {
    return randomBytes(18).toString("base64url");
  }

  // -------------------------------------------------------------------------
  // Room lifecycle
  // -------------------------------------------------------------------------
  createRoom(): LiveRoom {
    const seed = env.seed ?? randomSeed();
    const rng = createRng(seed);
    const code = generateRoomCode(createRng(randomSeed()), (c) => this.store.has(c));
    const rec: LiveRoom = {
      room: createRoom(code, Date.now(), this.content),
      seats: new Map(),
      playerData: {},
      seed,
      rngState: seed,
      lastActivity: Date.now(),
      rng,
      lastPublic: "",
      lastPrivate: new Map(),
    };
    this.store.set(code, rec);
    console.log(`[room ${code}] created`);
    return rec;
  }

  /** Join (or re-join with a token). Returns the seat. */
  join(
    socket: IoSocket,
    rec: LiveRoom,
    args: { role: "player" | "display"; name?: string; color?: string; avatar?: string | null; token?: string; profileId?: string | null },
  ): Seat {
    const room = rec.room;
    let seat = args.token ? rec.seats.get(args.token) : undefined;
    if (seat && seat.playerId && !room.players.some((p) => p.id === seat!.playerId)) {
      // was kicked or removed
      rec.seats.delete(seat.token);
      seat = undefined;
    }
    if (seat) {
      if (seat.role === "player" && seat.playerId) {
        rec.room = updatePlayer(room, seat.playerId, { connected: true, disconnectedAt: null });
        this.apply(rec, onConnectionChange(rec.room, this.ctx(rec)));
      } else if (seat.role === "display") {
        rec.room = { ...room, displays: room.displays + 1 };
      }
    } else if (args.role === "display") {
      seat = { token: this.newToken(), role: "display", playerId: null, profileId: null };
      rec.seats.set(seat.token, seat);
      rec.room = { ...room, displays: room.displays + 1 };
    } else {
      const id = "p_" + randomBytes(6).toString("base64url");
      rec.room = addPlayer(room, { id, name: args.name ?? "", color: args.color, avatar: args.avatar, now: Date.now() });
      seat = { token: this.newToken(), role: "player", playerId: id, profileId: args.profileId ?? null };
      rec.seats.set(seat.token, seat);
    }
    // Only one live socket per seat: kick older sockets holding the same token.
    for (const [, other] of this.io.of("/").sockets) {
      if (other.id !== socket.id && other.data.token === seat.token && other.data.code === room.code) {
        other.data.code = undefined;
        other.leave(room.code);
        other.disconnect(true);
      }
    }
    socket.data = { code: room.code, token: seat.token, role: seat.role, playerId: seat.playerId };
    socket.join(room.code);
    rec.lastActivity = Date.now();
    this.broadcast(rec, []);
    return seat;
  }

  disconnect(socket: IoSocket) {
    const { code, role, playerId } = socket.data;
    if (!code) return;
    const rec = this.tryGet(code);
    if (!rec) return;
    if (role === "display") rec.room = { ...rec.room, displays: Math.max(0, rec.room.displays - 1) };
    if (role === "player" && playerId && rec.room.players.some((p) => p.id === playerId)) {
      rec.room = updatePlayer(rec.room, playerId, { connected: false, disconnectedAt: gameClock(rec.room, Date.now()) });
      this.apply(rec, onConnectionChange(rec.room, this.ctx(rec)));
    }
    rec.lastPrivate.delete(socket.id);
    this.broadcast(rec, []);
  }

  leave(socket: IoSocket) {
    const { code, playerId, token } = socket.data;
    if (!code) return;
    const rec = this.get(code);
    if (playerId && rec.room.stage === "lobby") {
      rec.room = removePlayer(rec.room, playerId);
      if (token) rec.seats.delete(token);
      delete rec.playerData[playerId];
    } else {
      this.disconnect(socket);
    }
    socket.leave(code);
    socket.data = {};
    this.broadcast(rec, []);
  }

  kick(rec: LiveRoom, actor: SocketData, playerId: string) {
    assertHost(rec.room, { playerId: actor.playerId ?? undefined, isDisplay: actor.role === "display" });
    if (actor.playerId === playerId) fail("INVALID_INPUT", "You can't kick yourself.");
    const target = rec.room.players.find((p) => p.id === playerId);
    if (!target) fail("UNKNOWN_PLAYER", "That player isn't in the room.");
    if (rec.room.game) {
      // Mid-game only players who dropped out can be removed; the game goes on without them.
      if (target.connected) fail("INVALID_INPUT", "During a game you can only remove disconnected players.");
      this.apply(rec, removePlayerFromGame(rec.room, playerId, this.ctx(rec)));
    } else {
      rec.room = removePlayer(rec.room, playerId);
    }
    delete rec.playerData[playerId];
    for (const [token, seat] of rec.seats) if (seat.playerId === playerId) rec.seats.delete(token);
    for (const [, s] of this.io.of("/").sockets) {
      if (s.data.code === rec.room.code && s.data.playerId === playerId) {
        s.emit("kicked");
        s.leave(rec.room.code);
        s.data = {};
      }
    }
    this.broadcast(rec, []);
  }

  // -------------------------------------------------------------------------
  // Lobby
  // -------------------------------------------------------------------------
  setReady(rec: LiveRoom, playerId: string, ready: boolean) {
    if (rec.room.stage !== "lobby") fail("GAME_IN_PROGRESS", "Game already running.");
    rec.room = updatePlayer(rec.room, playerId, { ready });
    this.broadcast(rec, []);
  }

  setProfile(rec: LiveRoom, playerId: string, patch: { name?: string; color?: string; avatar?: string | null }) {
    rec.room = setPlayerProfile(rec.room, playerId, patch);
    this.broadcast(rec, []);
  }

  addCustom(rec: LiveRoom, playerId: string, draft: CustomQuestionDraft) {
    const author = rec.room.players.find((p) => p.id === playerId);
    if (!author) fail("UNKNOWN_PLAYER", "Only players can add questions.");
    rec.room = addCustomQuestion(rec.room, { id: author.id, name: author.name }, draft, `custom.${randomBytes(5).toString("hex")}`);
    this.broadcast(rec, []);
  }

  removeCustom(rec: LiveRoom, actor: SocketData, id: string) {
    const isHost = actor.role === "display" || (!!actor.playerId && rec.room.hostId === actor.playerId);
    rec.room = removeCustomQuestion(rec.room, { playerId: actor.playerId ?? undefined, isHost }, id);
    this.broadcast(rec, []);
  }

  setSettings(rec: LiveRoom, actor: SocketData, patch: Partial<RoomSettings>) {
    assertHost(rec.room, { playerId: actor.playerId ?? undefined, isDisplay: actor.role === "display" });
    rec.room = updateSettings(rec.room, patch, this.content);
    this.broadcast(rec, []);
  }

  start(rec: LiveRoom, actor: SocketData, mode: "board" | "questionDebug" | "minigameDebug", minigameId?: string) {
    assertHost(rec.room, { playerId: actor.playerId ?? undefined, isDisplay: actor.role === "display" });
    if (rec.room.stage !== "lobby") fail("GAME_IN_PROGRESS", "Game already running.");
    const check = canStart(rec.room);
    if (!check.ok) fail(rec.room.players.length < 2 ? "NOT_ENOUGH_PLAYERS" : "NOT_READY", check.reason);
    const res = startGame(rec.room, this.ctx(rec), mode, { minigameId });
    this.apply(rec, res);
    if (mode === "board") persistence.onGameStart(rec);
  }

  pause(rec: LiveRoom, actor: SocketData, paused: boolean) {
    assertHost(rec.room, { playerId: actor.playerId ?? undefined, isDisplay: actor.role === "display" });
    rec.room = setPaused(rec.room, paused, actor.playerId ?? null, Date.now());
    rec.lastActivity = Date.now();
    this.broadcast(rec, []);
  }

  abort(rec: LiveRoom, actor: SocketData) {
    assertHost(rec.room, { playerId: actor.playerId ?? undefined, isDisplay: actor.role === "display" });
    rec.room = { ...rec.room, stage: "lobby", game: null, players: rec.room.players.map((p) => ({ ...p, ready: false })) };
    this.broadcast(rec, []);
  }

  playAgain(rec: LiveRoom, actor: SocketData) {
    assertHost(rec.room, { playerId: actor.playerId ?? undefined, isDisplay: actor.role === "display" });
    if (rec.room.game?.phase !== "podium") fail("WRONG_PHASE", "The game isn't over yet.");
    const lobby: RoomState = { ...rec.room, stage: "lobby", game: null, players: rec.room.players.map((p) => ({ ...p, ready: true })) };
    const res = startGame(lobby, this.ctx(rec), "board");
    this.apply(rec, res);
    persistence.onGameStart(rec);
  }

  // -------------------------------------------------------------------------
  // Game actions & loop
  // -------------------------------------------------------------------------
  action(rec: LiveRoom, actor: SocketData, action: GameAction) {
    const isHost = actor.role === "display" || (!!actor.playerId && rec.room.hostId === actor.playerId);
    const res = applyGameAction(rec.room, action, this.ctx(rec), isHost);
    rec.lastActivity = Date.now();
    this.apply(rec, res);
  }

  apply(rec: LiveRoom, res: EngineResult | null) {
    if (!res) return;
    const before = rec.room;
    rec.room = res.room;
    persistence.afterStep(rec, before, res.events);
    this.broadcast(rec, res.events);
  }

  tick() {
    const now = Date.now();
    for (const r of this.store.all()) {
      const rec = r as LiveRoom;
      try {
        if (rec.room.game) this.apply(rec, tickGame(rec.room, this.ctx(rec)));
        // Lobby: drop players who left long ago so "everyone ready" isn't blocked forever.
        if (rec.room.stage === "lobby") {
          const stale = rec.room.players.filter((p) => !p.connected && p.disconnectedAt && now - p.disconnectedAt > LOBBY_DISCONNECT_REMOVE_MS);
          for (const p of stale) {
            rec.room = removePlayer(rec.room, p.id);
            for (const [t, s] of rec.seats) if (s.playerId === p.id) rec.seats.delete(t);
          }
          if (stale.length) this.broadcast(rec, []);
        }
        const anyoneHere = rec.room.players.some((p) => p.connected) || rec.room.displays > 0;
        if (!anyoneHere && now - rec.lastActivity > GAME_CONFIG.room.emptyRoomTtlMs) {
          console.log(`[room ${rec.room.code}] expired`);
          this.store.delete(rec.room.code);
        } else if (anyoneHere) rec.lastActivity = Math.max(rec.lastActivity, now - 1);
      } catch (e) {
        console.error(`[room ${rec.room.code}] tick failed`, e);
      }
    }
  }

  /** Send public state to everyone, private state per socket, and animation events. Skips unchanged. */
  broadcast(rec: LiveRoom, events: GameEvent[]) {
    const now = Date.now();
    const pub = toPublicState(rec.room, this.minigames, gameClock(rec.room, now));
    const { serverNow: _sn, ...comparable } = pub;
    const pubKey = JSON.stringify(comparable);
    const code = rec.room.code;
    if (pubKey !== rec.lastPublic) {
      rec.lastPublic = pubKey;
      this.io.to(code).emit("state:public", pub);
    }
    if (events.length) this.io.to(code).emit("event", events);
    const sockets = this.io.of("/").adapter.rooms.get(code);
    if (!sockets) return;
    for (const sid of sockets) {
      const s = this.io.of("/").sockets.get(sid) as IoSocket | undefined;
      if (!s) continue;
      const priv = toPrivateState(rec.room, s.data.playerId ?? null, this.minigames, gameClock(rec.room, now));
      const key = JSON.stringify(priv);
      if (rec.lastPrivate.get(sid) !== key) {
        rec.lastPrivate.set(sid, key);
        s.emit("state:private", priv);
      }
    }
  }

  chat(rec: LiveRoom, playerId: string, raw: string) {
    const text = sanitizeChat(raw);
    if (!text) fail("INVALID_INPUT", "Say something first.");
    if (!rec.room.players.some((p) => p.id === playerId)) fail("UNKNOWN_PLAYER", "Only players can chat.");
    const now = Date.now();
    rec.lastChatAt ??= new Map();
    if (now - (rec.lastChatAt.get(playerId) ?? 0) < CHAT_MIN_INTERVAL_MS) fail("RATE_LIMITED", "Slow down!");
    rec.lastChatAt.set(playerId, now);
    const msg: ChatMessage = { id: randomBytes(6).toString("hex"), playerId, text, at: now };
    rec.chat = [...(rec.chat ?? []), msg].slice(-CHAT_HISTORY);
    rec.lastActivity = now;
    this.io.to(rec.room.code).emit("chat:message", msg);
  }

  /** Force-resend full state to one socket (after (re)join). */
  resend(rec: LiveRoom, socket: IoSocket) {
    socket.emit("chat:history", rec.chat ?? []);
    const now = Date.now();
    socket.emit("state:public", toPublicState(rec.room, this.minigames, gameClock(rec.room, now)));
    const priv = toPrivateState(rec.room, socket.data.playerId ?? null, this.minigames, gameClock(rec.room, now));
    rec.lastPrivate.set(socket.id, JSON.stringify(priv));
    socket.emit("state:private", priv);
  }

  errorOf(e: unknown): { code: string; message: string } {
    if (e instanceof GameError) return { code: e.code, message: e.message };
    console.error(e);
    return { code: "INTERNAL", message: "Something went wrong." };
  }
}

export type { LiveRoom };
