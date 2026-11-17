import { GAME_CONFIG, PLAYER_COLORS } from "../config/game";
import type { ContentBundle } from "../content/schemas";
import type { Rng } from "../rng";
import { fail } from "./errors";
import { CUSTOM_PACK_ID } from "../logic/custom";
import type { RoomPlayer, RoomSettings, RoomState } from "./types";

export function generateRoomCode(rng: Rng, taken: (code: string) => boolean = () => false): string {
  const { codeAlphabet, codeLength } = GAME_CONFIG.room;
  for (let attempt = 0; attempt < 1000; attempt++) {
    let code = "";
    for (let i = 0; i < codeLength; i++) code += codeAlphabet[Math.floor(rng() * codeAlphabet.length)];
    if (!taken(code)) return code;
  }
  throw new Error("could not generate a free room code");
}

export function defaultSettings(content: ContentBundle): RoomSettings {
  return {
    turnCount: GAME_CONFIG.turns.default,
    themes: content.themes.map((t) => t.id),
    tileFrequency: {},
    starGoal: GAME_CONFIG.starGoals.default,
    packs: [...selectablePacks(content).map((p) => p.id), CUSTOM_PACK_ID],
    dataQuestions: true,
    familyFriendly: false,
    language: "en",
    boardId: content.boards[0]?.id ?? "classic",
  };
}

/** Packs players can toggle: ones with regular questions (data-only packs need account linking). */
export function selectablePacks(content: ContentBundle) {
  return content.packs.filter((p) => p.questions.some((q) => !q.truthSource));
}

export function createRoom(code: string, now: number, content: ContentBundle): RoomState {
  return {
    code,
    createdAt: now,
    hostId: null,
    settings: defaultSettings(content),
    players: [],
    displays: 0,
    customQuestions: [],
    stage: "lobby",
    game: null,
  };
}

export function sanitizeName(name: string): string {
  return name.replace(/[\u0000-\u001f]/g, "").replace(/\s+/g, " ").trim().slice(0, 16);
}

export function freeColor(room: RoomState): string {
  const used = new Set(room.players.map((p) => p.color));
  return PLAYER_COLORS.find((c) => !used.has(c.id))?.id ?? PLAYER_COLORS[0].id;
}

export function addPlayer(
  room: RoomState,
  args: { id: string; name: string; color?: string; now: number },
): RoomState {
  if (room.stage !== "lobby") fail("GAME_IN_PROGRESS", "This game has already started.");
  if (room.players.length >= GAME_CONFIG.players.max) fail("ROOM_FULL", `This room is full (${GAME_CONFIG.players.max} players max).`);
  const name = sanitizeName(args.name);
  if (!name) fail("NAME_INVALID", "Please enter a name.");
  if (room.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) fail("NAME_TAKEN", "That name is taken.");
  let color = args.color && PLAYER_COLORS.some((c) => c.id === args.color) ? args.color : freeColor(room);
  if (room.players.some((p) => p.color === color)) color = freeColor(room);
  const player: RoomPlayer = {
    id: args.id,
    name,
    color,
    ready: false,
    connected: true,
    joinedAt: args.now,
    disconnectedAt: null,
    linked: [],
  };
  return { ...room, players: [...room.players, player], hostId: room.hostId ?? player.id };
}

export function updatePlayer(room: RoomState, playerId: string, patch: Partial<RoomPlayer>): RoomState {
  if (!room.players.some((p) => p.id === playerId)) fail("UNKNOWN_PLAYER", "Unknown player.");
  return { ...room, players: room.players.map((p) => (p.id === playerId ? { ...p, ...patch } : p)) };
}

export function setPlayerProfile(
  room: RoomState,
  playerId: string,
  patch: { name?: string; color?: string },
): RoomState {
  if (room.stage !== "lobby") fail("GAME_IN_PROGRESS", "Can't change that during a game.");
  const out: Partial<RoomPlayer> = {};
  if (patch.name !== undefined) {
    const name = sanitizeName(patch.name);
    if (!name) fail("NAME_INVALID", "Please enter a name.");
    if (room.players.some((p) => p.id !== playerId && p.name.toLowerCase() === name.toLowerCase()))
      fail("NAME_TAKEN", "That name is taken.");
    out.name = name;
  }
  if (patch.color !== undefined) {
    if (!PLAYER_COLORS.some((c) => c.id === patch.color)) fail("INVALID_INPUT", "Unknown color.");
    if (room.players.some((p) => p.id !== playerId && p.color === patch.color)) fail("COLOR_TAKEN", "That color is taken.");
    out.color = patch.color;
  }
  return updatePlayer(room, playerId, { ...out, ready: false });
}

export function removePlayer(room: RoomState, playerId: string): RoomState {
  const players = room.players.filter((p) => p.id !== playerId);
  const hostId = room.hostId === playerId ? (players[0]?.id ?? null) : room.hostId;
  return { ...room, players, hostId };
}

export function assertHost(room: RoomState, actor: { playerId?: string; isDisplay?: boolean }) {
  // Displays are the shared screen in the room and may use host controls too.
  if (actor.isDisplay) return;
  if (!actor.playerId || room.hostId !== actor.playerId) fail("NOT_HOST", "Only the host can do that.");
}

export function updateSettings(room: RoomState, patch: Partial<RoomSettings>, content: ContentBundle): RoomState {
  if (room.stage !== "lobby") fail("GAME_IN_PROGRESS", "Settings are locked during a game.");
  const s = { ...room.settings, ...patch };
  if (!(GAME_CONFIG.turns.options as readonly number[]).includes(s.turnCount)) fail("INVALID_INPUT", "Invalid turn count.");
  const known = new Set(content.themes.map((t) => t.id));
  s.themes = [...new Set(s.themes)].filter((t) => known.has(t));
  if (s.themes.length === 0) fail("INVALID_INPUT", "Pick at least one theme.");
  if (!content.boards.some((b) => b.id === s.boardId)) fail("INVALID_INPUT", "Unknown board.");
  if (!(GAME_CONFIG.starGoals.options as readonly number[]).includes(s.starGoal ?? 0)) fail("INVALID_INPUT", "Invalid win condition.");
  const packIds = new Set([...selectablePacks(content).map((p) => p.id), CUSTOM_PACK_ID]);
  s.packs = [...new Set(s.packs)].filter((p) => packIds.has(p));
  if (s.packs.length === 0) fail("INVALID_INPUT", "Pick at least one question pack.");
  const tileIds = new Set(content.tiles.map((t) => t.id));
  const freqs = new Set(Object.keys(GAME_CONFIG.tiles.frequency));
  s.tileFrequency = Object.fromEntries(
    Object.entries(s.tileFrequency ?? {}).filter(
      ([k, v]) => tileIds.has(k) && freqs.has(v) && !GAME_CONFIG.tiles.notTunable.includes(k),
    ),
  ) as RoomSettings["tileFrequency"];
  return { ...room, settings: s, players: room.players.map((p) => ({ ...p, ready: false })) };
}

/** Data questions only make sense if at least one player linked an account with usable data. */
export function dataQuestionsAvailable(room: RoomState): boolean {
  return room.players.some((p) => p.linked.some((l) => l.status === "ok"));
}

export function canStart(room: RoomState): { ok: true } | { ok: false; reason: string } {
  if (room.players.length < GAME_CONFIG.players.min) return { ok: false, reason: "Need at least 2 players." };
  if (!room.players.every((p) => p.ready)) return { ok: false, reason: "Everyone needs to be ready." };
  return { ok: true };
}
