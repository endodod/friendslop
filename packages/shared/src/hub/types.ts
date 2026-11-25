import type { z } from "zod";
import type { ContentBundle } from "../content/schemas";
import type { GameEvent, PlayerId, RoomPlayer, RoomSettings } from "../engine/types";
import type { Rng } from "../rng";

/**
 * Hub games: every game in the hub except the party board game (which keeps its own, much bigger
 * engine in engine/game.ts). A hub game is a `HubGameDefinition`: pure rules over its own state,
 * driven by the shared runtime in hub/engine.ts (tutorial, pause, timers, bots, podium, projection).
 */
export type HubGameId = "spygrid" | "spectrum" | "bluff";
export type GameId = "party" | HubGameId;

export type TeamId = "a" | "b";

/** Lobby settings of the hub games (kept per game, so switching games doesn't lose them). */
export interface HubSettings {
  spygrid: {
    /** Clue and guess timers. off = no timers (the host can still end a turn). */
    pace: "fast" | "normal" | "relaxed" | "off";
  };
  spectrum: {
    /** How many clues each player gives (rounds = players × this). */
    cluesEach: number;
  };
  bluff: {
    /** How many rounds each player is the one everyone bluffs about. */
    roundsEach: number;
  };
}

export const DEFAULT_HUB_SETTINGS: HubSettings = {
  spygrid: { pace: "normal" },
  spectrum: { cluesEach: 2 },
  bluff: { roundsEach: 1 },
};

/** Every hub game state has a phase with a clock. The runtime handles timeouts from these. */
export interface HubPhaseState {
  phase: string;
  phaseStartedAt: number;
  /** null = waits without a timer. */
  phaseEndsAt: number | null;
}

/** One line on a player's results card. */
export interface HubStatLine {
  label: string;
  value: string | number;
}

export interface HubPlacement {
  playerId: PlayerId;
  /** 1-based, ties share a rank. */
  rank: number;
  score: number;
}

export interface HubHighlight {
  icon: string;
  title: string;
  text: string;
  playerIds: PlayerId[];
}

export interface HubResults {
  ranking: HubPlacement[];
  /** Who won (rank 1, or the winning team). Used for account stats. */
  winners: PlayerId[];
  /** Big line on the podium, e.g. "Team Foxes wins!". */
  headline: string;
  /** Name of the unit scores are counted in, e.g. "points" or "cards". */
  scoreLabel: string;
  stats: Record<PlayerId, HubStatLine[]>;
  highlights: HubHighlight[];
  /** Team games: the podium shows teams instead of a top 3. */
  teams?: { id: TeamId; name: string; score: number; won: boolean; players: PlayerId[] }[];
}

export type HubStage = "intro" | "playing" | "podium";

export interface HubRuntime {
  gameId: HubGameId;
  matchId: string;
  startedAt: number;
  stage: HubStage;
  stageStartedAt: number;
  stageEndsAt: number | null;
  /** Players who tapped "Got it!" on the tutorial. */
  ready: PlayerId[];
  /** Everyone playing (bots included), in seat order. */
  players: PlayerId[];
  state: unknown;
  results: HubResults | null;
  /** Host pause. While set, the game clock stands still (see engine/pause.ts). */
  pause?: { since: number; by: PlayerId | null } | null;
  clockOffsetMs?: number;
}

/** Lobby choices handed to `init`: teams (balanced, every player has one) and each team's clue-giver. */
export interface HubSetup {
  teams: Record<PlayerId, TeamId>;
  clueGivers: Partial<Record<TeamId, PlayerId>>;
}

/** What a hub game sees during one step. Mutations go to the state passed alongside. */
export interface HubCtx {
  now: number;
  rng: Rng;
  content: ContentBundle;
  settings: RoomSettings;
  players: RoomPlayer[];
  emit(e: GameEvent): void;
  name(pid: PlayerId): string;
  isConnected(pid: PlayerId): boolean;
  isBot(pid: PlayerId): boolean;
  /** Game-clock time this player has been gone since (null = connected). */
  disconnectedSince(pid: PlayerId): number | null;
}

export interface HubGameDefinition<S extends HubPhaseState = HubPhaseState, A = unknown> {
  id: HubGameId;
  /** Validates the payload of `hub:action`. */
  actionSchema: z.ZodType<A>;
  /** Start state. `players` are in seat order; teams come from the lobby (already balanced). */
  init(players: PlayerId[], ctx: HubCtx, setup: HubSetup): S;
  /** The tutorial is over: start the first phase. */
  begin(state: S, ctx: HubCtx): void;
  action(state: S, playerId: PlayerId, action: A, ctx: HubCtx): void;
  /** The current phase's timer ran out (or `stalled` said nobody can act). */
  timeout(state: S, ctx: HubCtx): void;
  /** Pure check: someone who has to act is gone (disconnected long enough), so `autoplay` should act for them. */
  stalled?(state: S, ctx: HubCtx): boolean;
  autoplay?(state: S, ctx: HubCtx): void;
  /** Host "skip": shorten a reveal / end a turn. Returns false if there's nothing to skip. */
  skip(state: S, ctx: HubCtx): boolean;
  removePlayer(state: S, playerId: PlayerId, ctx: HubCtx): void;
  /** A connection changed: e.g. the only missing answer left → move on. */
  connectionChanged?(state: S, ctx: HubCtx): void;
  isOver(state: S): boolean;
  results(state: S, ctx: HubCtx): HubResults;
  publicState(state: S, now: number): unknown;
  privateState(state: S, playerId: PlayerId | null, now: number): unknown;
  /** Test bots: what this bot does now ([] = nothing). Called a few times a second. */
  bot(state: S, botId: PlayerId, ctx: HubCtx): A[];
}

export type AnyHubGame = HubGameDefinition<any, any>;
