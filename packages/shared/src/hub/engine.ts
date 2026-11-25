import { GAME_CONFIG } from "../config/game";
import { uid, type EngineContext } from "../engine/context";
import { fail } from "../engine/errors";
import type { EngineResult } from "../engine/game";
import type { GameEvent, PlayerId, RoomState } from "../engine/types";
import { shuffle, type Rng } from "../rng";
import { gameInfo } from "./catalog";
import { HUB_GAMES } from "./registry";
import type { AnyHubGame, HubCtx, HubGameId, HubPhaseState, HubRuntime, HubSetup, TeamId } from "./types";

/** Max time on the how-to-play screen (ends early once everyone taps "Got it!"). */
export const HUB_INTRO_MS = GAME_CONFIG.timers.gameStartMs;
/** Skips within this long after a phase starts are ignored (double taps). */
const SKIP_GRACE_MS = 1200;

export function isHubGame(id: string | undefined | null): id is HubGameId {
  return !!id && id in HUB_GAMES;
}

export function hubDef(id: HubGameId): AnyHubGame {
  const def = HUB_GAMES[id];
  if (!def) throw new Error(`unknown hub game ${id}`);
  return def;
}

// ---------------------------------------------------------------------------
// Teams (Spy Grid): picked in the lobby, the rest balanced at start
// ---------------------------------------------------------------------------
/** Everyone gets a team: lobby picks are kept, players without one fill the smaller team. */
export function balanceTeams(room: Pick<RoomState, "players">, rng: Rng): Record<PlayerId, TeamId> {
  const out: Record<PlayerId, TeamId> = {};
  const count = { a: 0, b: 0 };
  for (const p of room.players)
    if (p.team) {
      out[p.id] = p.team;
      count[p.team]++;
    }
  for (const p of shuffle(
    rng,
    room.players.filter((p) => !p.team),
  )) {
    const t: TeamId = count.a < count.b ? "a" : count.b < count.a ? "b" : rng() < 0.5 ? "a" : "b";
    out[p.id] = t;
    count[t]++;
  }
  return out;
}

/** One clue-giver per team: a volunteer if there is one, else someone who didn't give clues last game. */
export function pickClueGivers(
  room: Pick<RoomState, "players" | "lastClueGivers">,
  teams: Record<PlayerId, TeamId>,
  rng: Rng,
): Partial<Record<TeamId, PlayerId>> {
  const out: Partial<Record<TeamId, PlayerId>> = {};
  for (const t of ["a", "b"] as const) {
    const members = room.players.filter((p) => teams[p.id] === t);
    if (!members.length) continue;
    const volunteer = members.find((p) => p.clueGiver);
    if (volunteer) {
      out[t] = volunteer.id;
      continue;
    }
    const fresh = members.filter((p) => !(room.lastClueGivers ?? []).includes(p.id));
    // Humans first: a bot clue-giver is only fun for testing.
    const pool = fresh.length ? fresh : members;
    const humans = pool.filter((p) => !p.bot);
    const from = humans.length ? humans : pool;
    out[t] = from[Math.floor(rng() * from.length)].id;
  }
  return out;
}

/** Can this room start the selected hub game? */
export function canStartHub(room: RoomState, id: HubGameId): { ok: true } | { ok: false; reason: string } {
  const info = gameInfo(id);
  if (room.players.length < info.players.min) return { ok: false, reason: `${info.name} needs at least ${info.players.min} players.` };
  if (room.players.length > info.players.max) return { ok: false, reason: `${info.name} is for up to ${info.players.max} players.` };
  if (id === "spygrid") {
    const t = balanceTeams(room, () => 0.5);
    const a = Object.values(t).filter((x) => x === "a").length;
    const b = Object.values(t).filter((x) => x === "b").length;
    if (a < 2 || b < 2) return { ok: false, reason: "Each team needs at least 2 players (a clue-giver and a guesser)." };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------
interface HubDraft {
  room: RoomState;
  rt: HubRuntime;
  def: AnyHubGame;
  hctx: HubCtx;
  events: GameEvent[];
}

function makeCtx(room: RoomState, ctx: EngineContext, events: GameEvent[]): HubCtx {
  const byId = new Map(room.players.map((p) => [p.id, p]));
  return {
    now: ctx.now,
    rng: ctx.rng,
    content: ctx.content,
    settings: room.settings,
    players: room.players,
    emit: (e) => events.push(e),
    name: (pid) => byId.get(pid)?.name ?? "?",
    isConnected: (pid) => byId.get(pid)?.connected ?? false,
    isBot: (pid) => !!byId.get(pid)?.bot,
    disconnectedSince: (pid) => {
      const p = byId.get(pid);
      if (!p || p.connected) return null;
      return p.disconnectedAt ?? 0;
    },
  };
}

function withHub(room: RoomState, ctx: EngineContext, fn: (d: HubDraft) => void): EngineResult {
  if (!room.hub) fail("WRONG_PHASE", "No game running.");
  const draft = structuredClone(room);
  const events: GameEvent[] = [];
  const d: HubDraft = { room: draft, rt: draft.hub!, def: hubDef(draft.hub!.gameId), hctx: makeCtx(draft, ctx, events), events };
  fn(d);
  checkOver(d);
  return { room: draft, events };
}

function setStage(d: HubDraft, stage: HubRuntime["stage"], ms: number | null) {
  d.rt.stage = stage;
  d.rt.stageStartedAt = d.hctx.now;
  d.rt.stageEndsAt = ms === null ? null : d.hctx.now + ms;
  d.rt.ready = [];
  d.events.push({ type: "hubPhase", phase: stage });
}

function begin(d: HubDraft) {
  setStage(d, "playing", null);
  d.def.begin(d.rt.state, d.hctx);
}

function checkOver(d: HubDraft) {
  if (d.rt.stage !== "playing" || !d.def.isOver(d.rt.state)) return;
  d.rt.results = d.def.results(d.rt.state, d.hctx);
  setStage(d, "podium", null);
  d.events.push({ type: "sfx", id: "fanfare" });
}

export function startHubGame(room: RoomState, ctx: EngineContext, gameId: HubGameId): EngineResult {
  const def = hubDef(gameId);
  const check = canStartHub(room, gameId);
  if (!check.ok) fail("NOT_ENOUGH_PLAYERS", check.reason);
  const events: GameEvent[] = [];
  const hctx = makeCtx(room, ctx, events);
  const players = room.players.map((p) => p.id);
  const setup: HubSetup = { teams: {}, clueGivers: {} };
  if (gameId === "spygrid") {
    setup.teams = balanceTeams(room, ctx.rng);
    setup.clueGivers = pickClueGivers(room, setup.teams, ctx.rng);
  }
  const rt: HubRuntime = {
    gameId,
    matchId: uid(ctx.rng),
    startedAt: ctx.now,
    stage: "intro",
    stageStartedAt: ctx.now,
    stageEndsAt: ctx.now + HUB_INTRO_MS,
    ready: [],
    players,
    state: def.init(players, hctx, setup),
    results: null,
    pause: null,
    clockOffsetMs: 0,
  };
  events.push({ type: "hubPhase", phase: "intro" });
  const next: RoomState = {
    ...room,
    stage: "game",
    game: null,
    hub: rt,
    lastClueGivers: gameId === "spygrid" ? (Object.values(setup.clueGivers) as PlayerId[]) : room.lastClueGivers,
    players: room.players.map((p) => ({ ...p, ready: false, team: gameId === "spygrid" ? setup.teams[p.id] : p.team })),
  };
  return { room: next, events };
}

export type HubAction =
  | { type: "ready"; playerId: PlayerId }
  | { type: "skip" }
  | { type: "game"; playerId: PlayerId; action: unknown };

export function applyHubAction(room: RoomState, a: HubAction, ctx: EngineContext, isHost = false): EngineResult {
  if (room.hub?.pause) fail("PAUSED", "The game is paused.");
  return withHub(room, ctx, (d) => {
    const { rt, def } = d;
    switch (a.type) {
      case "ready": {
        if (rt.stage !== "intro") return;
        if (!rt.players.includes(a.playerId)) fail("UNKNOWN_PLAYER", "You're not in this game.");
        if (!rt.ready.includes(a.playerId)) rt.ready.push(a.playerId);
        const needed = rt.players.filter((p) => d.hctx.isConnected(p));
        if (needed.every((p) => rt.ready.includes(p))) begin(d);
        return;
      }
      case "skip": {
        if (!isHost) fail("NOT_HOST", "Only the host can skip.");
        if (rt.stage === "intro") {
          if (d.hctx.now - rt.stageStartedAt < SKIP_GRACE_MS) return;
          return begin(d);
        }
        if (rt.stage !== "playing") fail("WRONG_PHASE", "Nothing to skip.");
        const st = rt.state as HubPhaseState;
        if (d.hctx.now - st.phaseStartedAt < SKIP_GRACE_MS) return;
        if (!def.skip(rt.state, d.hctx)) fail("WRONG_PHASE", "Nothing to skip.");
        return;
      }
      case "game": {
        if (rt.stage !== "playing") fail("WRONG_PHASE", "You can't do that right now.");
        if (!rt.players.includes(a.playerId)) fail("UNKNOWN_PLAYER", "You're not in this game.");
        const parsed = def.actionSchema.safeParse(a.action);
        if (!parsed.success) fail("INVALID_INPUT", "Invalid move.");
        def.action(rt.state, a.playerId, parsed.data, d.hctx);
        return;
      }
    }
  });
}

/** Server loop (~15 Hz): timers and autoplay for players who left. Null = nothing to do. */
export function tickHub(room: RoomState, ctx: EngineContext): EngineResult | null {
  const rt = room.hub;
  if (!rt || rt.pause || rt.stage === "podium") return null;
  const now = ctx.now;
  if (rt.stage === "intro") {
    if (rt.stageEndsAt === null || now < rt.stageEndsAt) return null;
    return withHub(room, ctx, (d) => begin(d));
  }
  const def = hubDef(rt.gameId);
  const st = rt.state as HubPhaseState;
  const timedOut = st.phaseEndsAt !== null && now >= st.phaseEndsAt;
  const stalled = !timedOut && !!def.stalled && def.stalled(rt.state, makeCtx(room, ctx, []));
  if (!timedOut && !stalled) return null;
  return withHub(room, ctx, (d) => {
    if (timedOut) d.def.timeout(d.rt.state, d.hctx);
    else d.def.autoplay?.(d.rt.state, d.hctx);
  });
}

/** Host removes a player mid-game. Below the game's minimum the game ends with what was earned. */
export function removePlayerFromHub(room: RoomState, playerId: PlayerId, ctx: EngineContext): EngineResult {
  return withHub(room, ctx, (d) => {
    const { rt, def } = d;
    if (!rt.players.includes(playerId)) fail("UNKNOWN_PLAYER", "That player isn't in this game.");
    d.room.players = d.room.players.filter((p) => p.id !== playerId);
    if (d.room.hostId === playerId) d.room.hostId = d.room.players[0]?.id ?? null;
    d.hctx = makeCtx(d.room, { ...ctx }, d.events);
    rt.players = rt.players.filter((p) => p !== playerId);
    rt.ready = rt.ready.filter((p) => p !== playerId);
    if (rt.stage === "podium") {
      if (rt.results) {
        rt.results.ranking = rt.results.ranking.filter((r) => r.playerId !== playerId);
        rt.results.winners = rt.results.winners.filter((p) => p !== playerId);
      }
      return;
    }
    def.removePlayer(rt.state, playerId, d.hctx);
    if (rt.stage === "intro") {
      const needed = rt.players.filter((p) => d.hctx.isConnected(p));
      if (needed.length && needed.every((p) => rt.ready.includes(p))) begin(d);
    }
  });
}

export function hubConnectionChange(room: RoomState, ctx: EngineContext): EngineResult | null {
  const rt = room.hub;
  if (!rt || rt.stage !== "playing") return null;
  const def = hubDef(rt.gameId);
  if (!def.connectionChanged) return null;
  return withHub(room, ctx, (d) => d.def.connectionChanged!(d.rt.state, d.hctx));
}

// ---------------------------------------------------------------------------
// Bots
// ---------------------------------------------------------------------------
/** Bots wait this long into a phase (and between moves) so humans can follow. */
export const HUB_BOT_DELAY_MS = 1500;

export interface HubBotMemory {
  lastAction: Map<PlayerId, number>;
}
export function newHubBotMemory(): HubBotMemory {
  return { lastAction: new Map() };
}

export function hubBotActions(room: RoomState, ctx: EngineContext, memo: HubBotMemory): HubAction[] {
  const rt = room.hub;
  if (!rt || rt.pause || rt.stage === "podium") return [];
  const bots = room.players.filter((p) => p.bot && rt.players.includes(p.id)).map((p) => p.id);
  if (!bots.length) return [];
  const now = ctx.now;
  if (rt.stage === "intro") {
    if (now - rt.stageStartedAt < HUB_BOT_DELAY_MS) return [];
    return bots.filter((b) => !rt.ready.includes(b)).map((b) => ({ type: "ready", playerId: b }) as HubAction);
  }
  const st = rt.state as HubPhaseState;
  if (now - st.phaseStartedAt < HUB_BOT_DELAY_MS) return [];
  const def = hubDef(rt.gameId);
  const hctx = makeCtx(room, ctx, []);
  const out: HubAction[] = [];
  for (const b of bots) {
    if (now - (memo.lastAction.get(b) ?? 0) < HUB_BOT_DELAY_MS) continue;
    const acts = def.bot(rt.state, b, hctx);
    if (!acts.length) continue;
    memo.lastAction.set(b, now);
    for (const action of acts) out.push({ type: "game", playerId: b, action });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Projection
// ---------------------------------------------------------------------------
export type PublicHub = Omit<HubRuntime, "state"> & { state: unknown };

export function toPublicHub(rt: HubRuntime, now: number): PublicHub {
  const def = hubDef(rt.gameId);
  return { ...rt, state: def.publicState(rt.state, now) };
}

export function toPrivateHub(rt: HubRuntime | null | undefined, playerId: PlayerId | null, now: number): unknown {
  if (!rt) return null;
  return hubDef(rt.gameId).privateState(rt.state, playerId, now);
}
