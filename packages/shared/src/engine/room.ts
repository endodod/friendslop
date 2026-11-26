import { GAME_CONFIG, PLAYER_COLORS, isPlayerAvatar } from "../config/game";
import type { ContentBundle } from "../content/schemas";
import type { Rng } from "../rng";
import { fail } from "./errors";
import { CUSTOM_PACK_ID } from "../logic/custom";
import { RANDOM_BOARD_ID } from "../logic/board";
import type { RoomPlayer, RoomSettings, RoomState } from "./types";
import { DEFAULT_HUB_SETTINGS, type GameId, type HubSettings, type TeamId } from "../hub/types";
import { GAMES, gameInfo } from "../hub/catalog";
import { canStartHub } from "../hub/engine";

/** Options of the hub games' lobby settings. */
export const HUB_SETTING_OPTIONS = {
  spygridPace: ["fast", "normal", "relaxed", "off"] as const,
  spectrumCluesEach: [1, 2, 3] as const,
  bluffRoundsEach: [1, 2, 3] as const,
  whowroteRounds: [2, 3, 4] as const,
  countupLevels: [6, 8, 10] as const,
  oddwordRounds: [3, 5, 8] as const,
  cluecrewCards: [7, 10, 13] as const,
};

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
    gameId: "party",
    hub: structuredClone(DEFAULT_HUB_SETTINGS),
    turnCount: GAME_CONFIG.turns.default,
    tileFrequency: {},
    minigameMix: {},
    starGoal: GAME_CONFIG.starGoals.default,
    packs: [...selectablePacks(content).filter((p) => p.defaultEnabled).map((p) => p.id), CUSTOM_PACK_ID],
    dataQuestions: true,
    familyFriendly: false,
    language: "en",
    // Board files load in alphabetical order; the default map stays Friendship Loop.
    boardId: content.boards.find((b) => b.id === "classic")?.id ?? content.boards[0]?.id ?? "classic",
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
    hub: null,
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
  args: {
    id: string;
    name: string;
    color?: string;
    avatar?: string | null;
    now: number;
    account?: { userId: string; username: string; photo: string | null } | null;
  },
): RoomState {
  // Joining a running game is fine: the server adds the seat to the game (addPlayerToGame / addPlayerToHub).
  if (room.players.length >= GAME_CONFIG.players.max) fail("ROOM_FULL", `This room is full (${GAME_CONFIG.players.max} players max).`);
  const name = sanitizeName(args.name);
  if (!name) fail("NAME_INVALID", "Please enter a name.");
  if (room.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) fail("NAME_TAKEN", "That name is taken.");
  if (args.account && room.players.some((p) => p.userId === args.account!.userId))
    fail("ALREADY_IN_ROOM", "You're already in this room on another device.");
  let color = args.color && PLAYER_COLORS.some((c) => c.id === args.color) ? args.color : freeColor(room);
  if (room.players.some((p) => p.color === color)) color = freeColor(room);
  const player: RoomPlayer = {
    id: args.id,
    name,
    color,
    avatar: args.avatar && isPlayerAvatar(args.avatar) ? args.avatar : null,
    userId: args.account?.userId ?? null,
    username: args.account?.username ?? null,
    photo: args.account?.photo ?? null,
    ready: false,
    connected: true,
    joinedAt: args.now,
    disconnectedAt: null,
    linked: [],
  };
  return { ...room, players: [...room.players, player], hostId: room.hostId ?? player.id };
}

/** Host: add a test bot (lobby only). Bots are always ready and are played by the server. */
export function addBot(room: RoomState, id: string, now: number): RoomState {
  let n = 1;
  while (room.players.some((p) => p.name.toLowerCase() === `bot ${n}`)) n++;
  const next = addPlayer(room, { id, name: `Bot ${n}`, avatar: "🤖", now });
  return { ...next, players: next.players.map((p) => (p.id === id ? { ...p, bot: true, ready: true } : p)) };
}

/** Everyone has to confirm "ready" again (settings changed, back in the lobby); bots stay ready. */
export function resetReady(room: RoomState): RoomState {
  return { ...room, players: room.players.map((p) => ({ ...p, ready: !!p.bot })) };
}

export function updatePlayer(room: RoomState, playerId: string, patch: Partial<RoomPlayer>): RoomState {
  if (!room.players.some((p) => p.id === playerId)) fail("UNKNOWN_PLAYER", "Unknown player.");
  return { ...room, players: room.players.map((p) => (p.id === playerId ? { ...p, ...patch } : p)) };
}

export function setPlayerProfile(
  room: RoomState,
  playerId: string,
  patch: { name?: string; color?: string; avatar?: string | null; photo?: string | null },
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
  if (patch.avatar !== undefined) {
    if (patch.avatar !== null && !isPlayerAvatar(patch.avatar)) fail("INVALID_INPUT", "Unknown icon.");
    out.avatar = patch.avatar;
  }
  // Server-resolved (the account's own picture or null), never taken from the client.
  if (patch.photo !== undefined) out.photo = patch.photo;
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

export type RoomSettingsPatch = Omit<Partial<RoomSettings>, "hub"> & {
  hub?: { [K in keyof HubSettings]?: Partial<HubSettings[K]> };
};

export function updateSettings(room: RoomState, patch: RoomSettingsPatch, content: ContentBundle): RoomState {
  if (room.stage !== "lobby") fail("GAME_IN_PROGRESS", "Settings are locked during a game.");
  const base = room.settings.hub ?? DEFAULT_HUB_SETTINGS;
  const hub: HubSettings = {
    spygrid: { ...DEFAULT_HUB_SETTINGS.spygrid, ...base.spygrid, ...patch.hub?.spygrid },
    spectrum: { ...DEFAULT_HUB_SETTINGS.spectrum, ...base.spectrum, ...patch.hub?.spectrum },
    bluff: { ...DEFAULT_HUB_SETTINGS.bluff, ...base.bluff, ...patch.hub?.bluff },
    whowrote: { ...DEFAULT_HUB_SETTINGS.whowrote, ...base.whowrote, ...patch.hub?.whowrote },
    countup: { ...DEFAULT_HUB_SETTINGS.countup, ...base.countup, ...patch.hub?.countup },
    oddword: { ...DEFAULT_HUB_SETTINGS.oddword, ...base.oddword, ...patch.hub?.oddword },
    cluecrew: { ...DEFAULT_HUB_SETTINGS.cluecrew, ...base.cluecrew, ...patch.hub?.cluecrew },
  };
  const s: RoomSettings = { ...room.settings, ...patch, hub, gameId: patch.gameId ?? room.settings.gameId ?? "party" };
  if (!GAMES.some((g) => g.id === s.gameId)) fail("INVALID_INPUT", "Unknown game.");
  const O = HUB_SETTING_OPTIONS;
  if (!(O.spygridPace as readonly string[]).includes(hub.spygrid.pace)) fail("INVALID_INPUT", "Invalid timer setting.");
  if (!(O.spectrumCluesEach as readonly number[]).includes(hub.spectrum.cluesEach)) fail("INVALID_INPUT", "Invalid round count.");
  if (!(O.bluffRoundsEach as readonly number[]).includes(hub.bluff.roundsEach)) fail("INVALID_INPUT", "Invalid round count.");
  if (!(O.whowroteRounds as readonly number[]).includes(hub.whowrote.rounds)) fail("INVALID_INPUT", "Invalid round count.");
  if (!(O.countupLevels as readonly number[]).includes(hub.countup.levels)) fail("INVALID_INPUT", "Invalid level count.");
  if (!(O.oddwordRounds as readonly number[]).includes(hub.oddword.rounds)) fail("INVALID_INPUT", "Invalid round count.");
  if (!(O.cluecrewCards as readonly number[]).includes(hub.cluecrew.cards)) fail("INVALID_INPUT", "Invalid deck size.");
  if (!(GAME_CONFIG.turns.options as readonly number[]).includes(s.turnCount)) fail("INVALID_INPUT", "Invalid turn count.");
  // Themes used to be a separate filter; packs are the only switch now.
  delete (s as { themes?: unknown }).themes;
  if (s.boardId !== RANDOM_BOARD_ID && !content.boards.some((b) => b.id === s.boardId)) fail("INVALID_INPUT", "Unknown board.");
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
  const mgIds = new Set(content.minigames.filter((m) => m.enabled && m.id !== "duel").map((m) => m.id));
  s.minigameMix = Object.fromEntries(
    Object.entries(s.minigameMix ?? {}).filter(([k, v]) => mgIds.has(k) && freqs.has(v) && v !== "normal"),
  ) as RoomSettings["tileFrequency"];
  if ([...mgIds].every((id) => s.minigameMix![id] === "off")) fail("INVALID_INPUT", "Keep at least one mini-game on.");
  return resetReady({ ...room, settings: s });
}

/** Data questions only make sense if at least one player linked an account with usable data. */
export function dataQuestionsAvailable(room: RoomState): boolean {
  return room.players.some((p) => p.linked.some((l) => l.status === "ok"));
}

/** `mode`: the party game's practice modes (no board) work with fewer players than the board game. */
export function canStart(room: RoomState, mode: "board" | "questionDebug" | "minigameDebug" = "board"): { ok: true } | { ok: false; reason: string } {
  if (room.players.length < GAME_CONFIG.players.min) return { ok: false, reason: "Need at least 2 players." };
  const gameId: GameId = room.settings.gameId ?? "party";
  if (gameId === "party" && mode === "board") {
    const min = gameInfo("party").players.min;
    if (room.players.length < min) return { ok: false, reason: `Party Board needs at least ${min} players (add a bot to try it out).` };
  }
  if (gameId !== "party") {
    const hub = canStartHub(room, gameId);
    if (!hub.ok) return hub;
  }
  if (!room.players.every((p) => p.ready)) return { ok: false, reason: "Everyone needs to be ready." };
  return { ok: true };
}

/** Spy Grid lobby: pick a team (null = any) and/or volunteer as the team's clue-giver. */
export function setTeam(room: RoomState, playerId: string, patch: { team?: TeamId | null; clueGiver?: boolean }): RoomState {
  if (room.stage !== "lobby") fail("GAME_IN_PROGRESS", "Teams are locked during a game.");
  const me = room.players.find((p) => p.id === playerId);
  if (!me) fail("UNKNOWN_PLAYER", "Unknown player.");
  const team = patch.team !== undefined ? patch.team : (me.team ?? null);
  let clueGiver = patch.clueGiver !== undefined ? patch.clueGiver : !!me.clueGiver;
  if (!team) clueGiver = false;
  if (clueGiver && room.players.some((p) => p.id !== playerId && p.team === team && p.clueGiver))
    fail("INVALID_INPUT", "Your team already has a clue-giver.");
  return { ...room, players: room.players.map((p) => (p.id === playerId ? { ...p, team, clueGiver } : p)) };
}

/** Host: shuffle everyone into two even teams (clears clue-giver picks). */
export function shuffleTeams(room: RoomState, rng: () => number): RoomState {
  if (room.stage !== "lobby") fail("GAME_IN_PROGRESS", "Teams are locked during a game.");
  const ids = room.players.map((p) => p.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  const teamOf = new Map(ids.map((id, i) => [id, (i % 2 === 0 ? "a" : "b") as TeamId]));
  return { ...room, players: room.players.map((p) => ({ ...p, team: teamOf.get(p.id) ?? null, clueGiver: false })) };
}
