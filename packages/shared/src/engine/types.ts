import type { Language } from "../i18n";
import type { QuestionFormat, Tolerance } from "../content/schemas";

export type PlayerId = string;

// ---------------------------------------------------------------------------
// Room / lobby
// ---------------------------------------------------------------------------
export type TileFrequency = "off" | "few" | "normal" | "many";

export interface RoomSettings {
  turnCount: number;
  themes: string[];
  /** Tile mix: tile type id → how often it appears (missing = normal). */
  tileFrequency: Record<string, TileFrequency>;
  /** 0 = most stars after the last round; otherwise the first player to reach this many stars wins. */
  starGoal: number;
  /** Enabled question pack ids. */
  packs: string[];
  dataQuestions: boolean;
  familyFriendly: boolean;
  language: Language;
  boardId: string;
}

export interface LinkedAccountInfo {
  provider: "steam" | "lastfm" | "spotify";
  displayName: string;
  avatarUrl?: string;
  /** ok: data usable. private: profile/game details private. error: fetch failed. */
  status: "ok" | "private" | "error" | "loading";
  gameCount?: number;
}

export interface RoomPlayer {
  id: PlayerId;
  name: string;
  color: string;
  ready: boolean;
  connected: boolean;
  joinedAt: number;
  disconnectedAt: number | null;
  linked: LinkedAccountInfo[];
}

export type RoomStage = "lobby" | "game";

/** A question written by a player in the lobby (the room's "Custom" pack). */
export interface CustomQuestion {
  id: string;
  authorId: PlayerId;
  authorName: string;
  question: import("../content/schemas").Question;
}

export interface RoomState {
  code: string;
  createdAt: number;
  /** null while only a display is in the room; first player becomes host then. */
  hostId: PlayerId | null;
  settings: RoomSettings;
  players: RoomPlayer[];
  displays: number;
  /** Questions written by players for this room. */
  customQuestions: CustomQuestion[];
  stage: RoomStage;
  game: GameState | null;
}

// ---------------------------------------------------------------------------
// Answers & questions
// ---------------------------------------------------------------------------
export type Answer =
  | { kind: "option"; optionId: string }
  | { kind: "number"; value: number }
  | { kind: "player"; playerId: PlayerId }
  | { kind: "order"; optionIds: string[] }
  | { kind: "hl"; dir: "higher" | "lower" };

export interface QuestionOption {
  id: string;
  label: string;
}

export interface ResolvedQuestion {
  /** content id, or generator id for data questions */
  id: string;
  format: QuestionFormat;
  themeId: string;
  prompt: string;
  options?: QuestionOption[];
  number?: { min: number; max: number; step: number; unit?: string; tolerance: Tolerance; minLabel?: string; maxLabel?: string };
  reference?: number;
  /** For `player` format: who can be picked. */
  playerChoices?: PlayerId[];
  isData: boolean;
  dataProvider?: string;
  /** Data questions: the real answer. Secret until reveal (stripped by projection). */
  truth?: Answer;
  /** Optional extra flavor shown on reveal (e.g. "312 hours"). */
  truthLabel?: string;
  tags?: string[];
}

/** mindReader: only the landing player guesses, double coins. */
export type QuestionContext = "tile" | "dataTile" | "mindReader" | "minigameIntro" | "debug" | "minigame";
export type QuestionStage = "intro" | "answering" | "reveal" | "results";

export interface PlayerQuestionResult {
  answer: Answer | null;
  isTarget: boolean;
  match: boolean;
  perfect: boolean;
  /** Close but not a match: earned partial points (scale questions). */
  close?: boolean;
  /** 0..1 closeness, used for ranking/duel ordering */
  score: number;
  coins: number;
}

export interface QuestionResult {
  truth: Answer | null;
  truthFrom: "target" | "data";
  perPlayer: Record<PlayerId, PlayerQuestionResult>;
  matchedCount: number;
  guesserCount: number;
  /** Data questions: was the target right about themselves? */
  targetSelfCorrect?: boolean;
}

export interface QuestionRound {
  uid: string;
  context: QuestionContext;
  targetId: PlayerId;
  /** Who answers (target included). */
  participants: PlayerId[];
  question: ResolvedQuestion;
  stage: QuestionStage;
  stageStartedAt: number;
  stageEndsAt: number;
  answers: Record<PlayerId, Answer>;
  answeredAt: Record<PlayerId, number>;
  /** Current selection of players who haven't locked in yet (secret). Used if time runs out. */
  drafts?: Record<PlayerId, Answer>;
  /** Item boosts active for this round. */
  boosts: Record<PlayerId, { peek?: boolean; wide?: boolean }>;
  result: QuestionResult | null;
  /** Reveal order: guessers first, target last. */
  revealOrder: PlayerId[];
  /** Coins are multiplied (data questions). */
  multiplier: number;
  /** Should coins be paid out by the engine (board tiles / debug)? */
  payCoins: boolean;
}

// ---------------------------------------------------------------------------
// Game
// ---------------------------------------------------------------------------
export type Phase =
  | "gameStart"
  | "turnStart"
  | "rolling"
  | "moving"
  | "junctionChoice"
  | "tileEffect"
  | "questionRound"
  | "shop"
  | "event"
  | "starPurchase"
  | "duel"
  | "turnEnd"
  | "roundEnd"
  | "minigameIntro"
  | "minigameQuestion"
  | "minigameCountdown"
  | "minigamePlaying"
  | "minigameResults"
  | "gameEnd"
  | "bonusStars"
  | "podium";

export interface PlayerStats {
  matchesMade: number;
  perfectMatches: number;
  guesses: number;
  timesTarget: number;
  matchedAsTarget: number;
  minigameWins: number;
  minigamesPlayed: number;
  coinsEarned: number;
  coinsLost: number;
  steals: number;
  stolenFrom: number;
  redTiles: number;
  blueTiles: number;
  stepsMoved: number;
  itemsUsed: number;
  starsBought: number;
  eventsDrawn: number;
  dataSelfCorrect: number;
  dataSelfWrong: number;
}

export function emptyStats(): PlayerStats {
  return {
    matchesMade: 0,
    perfectMatches: 0,
    guesses: 0,
    timesTarget: 0,
    matchedAsTarget: 0,
    minigameWins: 0,
    minigamesPlayed: 0,
    coinsEarned: 0,
    coinsLost: 0,
    steals: 0,
    stolenFrom: 0,
    redTiles: 0,
    blueTiles: 0,
    stepsMoved: 0,
    itemsUsed: 0,
    starsBought: 0,
    eventsDrawn: 0,
    dataSelfCorrect: 0,
    dataSelfWrong: 0,
  };
}

export interface GamePlayer {
  id: PlayerId;
  coins: number;
  stars: number;
  tileId: string;
  items: string[];
  /** frozen: skips their next turn (Freeze item). */
  effects: { shield: boolean; frozen?: boolean };
  stats: PlayerStats;
}

export interface Placement {
  playerId: PlayerId;
  /** 1-based; ties share a rank */
  rank: number;
  score?: number;
  label?: string;
}

export interface MinigameRuntime {
  id: string;
  kind: "soloScored" | "sharedRealtime" | "turnBased" | "questionOnly";
  origin: "round" | "duel";
  participants: PlayerId[];
  bonuses: PlayerId[];
  seed: number;
  startedAt: number;
  endsAt: number;
  state: unknown;
  placements: Placement[] | null;
  payout: Record<PlayerId, number> | null;
  /** Players the intro question will be about (picked at intro). */
  introTargetId: PlayerId | null;
}

export interface GameLogEntry {
  at: number;
  text: string;
  playerId?: PlayerId;
}

export interface BonusStarAward {
  bonusStarId: string;
  playerIds: PlayerId[];
  value: number;
}

export type GameMode = "board" | "questionDebug" | "minigameDebug";

export interface GameState {
  mode: GameMode;
  matchId: string;
  startedAt: number;
  phase: Phase;
  phaseStartedAt: number;
  phaseEndsAt: number | null;
  round: number;
  turnCount: number;
  order: PlayerId[];
  activeIndex: number;
  players: Record<PlayerId, GamePlayer>;
  boardId: string;
  /** Tile types for this game after applying the tile mix setting — tileId → tile type id */
  tileTypes: Record<string, string>;
  starTileId: string;
  /** Piggy Bank pot (coins dropped by players walking past). */
  bank: number;

  /** bonus: extra steps from Sprint Shoes. */
  dice: { values: number[]; total: number; kind: "normal" | "double" | "custom"; bonus?: number } | null;
  /** Extra steps added to this turn's roll (Sprint Shoes). */
  diceBonus?: number;
  pendingDice: { kind: "double" } | { kind: "custom" } | null;
  movement: { remaining: number; path: string[]; next: "junction" | "starPass" | "shopPass" | "landed"; chosen?: string } | null;
  junction: { tileId: string; options: string[] } | null;
  /** itemId: item won on an Item tile (null = bag was full, got coins instead). */
  tileResult: { tileId: string; type: string; coinsDelta?: number; itemId?: string | null; roll?: number; text?: string } | null;
  question: QuestionRound | null;
  /** `passing`: stopped at a Shop while walking past it; movement continues afterwards. */
  shop: { stock: string[]; bought: string[]; passing?: boolean } | null;
  event: { cardId: string; text: string; affected: PlayerId[]; blocked: PlayerId[] } | null;
  star: { passing: boolean } | null;
  duel: { challengerId: PlayerId; opponentId: PlayerId | null } | null;
  minigame: MinigameRuntime | null;
  /** Pick the Target item. */
  targetOverride: { by: PlayerId; targetId: PlayerId } | null;
  history: {
    questionIds: string[];
    lastThemeId: string | null;
    minigamesPlayed: string[];
    targetCounts: Record<PlayerId, number>;
  };
  bonusStars: { awards: BonusStarAward[]; revealed: number } | null;
  finalRanking: PlayerId[] | null;
  log: GameLogEntry[];
  /** Star race: who reached the star goal (ends the game immediately). */
  starGoalWinner?: PlayerId | null;
  /** Players who tapped "Got it!" on the current tutorial screen (game start, mini-game intro). */
  ready: PlayerId[];
  /** minigameDebug mode: play this mini-game first. */
  debugMinigameId?: string | null;
}

// ---------------------------------------------------------------------------
// Events (for client animations / sfx). Never contain secrets.
// ---------------------------------------------------------------------------
export type GameEvent =
  | { type: "coinsChanged"; playerId: PlayerId; delta: number; reason: string }
  | { type: "starsChanged"; playerId: PlayerId; delta: number; reason: string }
  | { type: "diceRolled"; playerId: PlayerId; values: number[] }
  | { type: "tokenMoved"; playerId: PlayerId; path: string[] }
  | { type: "tokenTeleported"; playerId: PlayerId; tileId: string }
  | { type: "answerLocked"; playerId: PlayerId }
  | { type: "questionRevealed" }
  | { type: "matchRevealed"; playerIds: PlayerId[]; perfectIds: PlayerId[] }
  | { type: "itemUsed"; playerId: PlayerId; itemId: string; targetId?: PlayerId }
  | { type: "itemBought"; playerId: PlayerId; itemId: string }
  | { type: "itemGained"; playerId: PlayerId; itemId: string }
  | { type: "shieldBlocked"; playerId: PlayerId }
  | { type: "eventDrawn"; cardId: string }
  | { type: "starMoved"; tileId: string }
  | { type: "minigameStarted"; id: string }
  | { type: "minigameFinished"; id: string }
  | { type: "bonusStarRevealed"; bonusStarId: string; playerIds: PlayerId[] }
  | { type: "phase"; phase: Phase }
  | { type: "sfx"; id: string; playerIds?: PlayerId[] }
  | { type: "toast"; text: string; playerId?: PlayerId };
