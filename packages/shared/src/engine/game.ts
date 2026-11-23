import { GAME_CONFIG } from "../config/game";
import type { ContentBundle } from "../content/schemas";
import { getFormat, validateAnswer } from "../formats";
import { localize } from "../i18n";
import { getBoard, resolveBoardId, getTile, nextTiles, placeStar, tileDef, computeTileTypes } from "../logic/board";
import { changeCoins, itemPrice, changeStars, placementCoins, standings, transferCoins } from "../logic/economy";
import { applyEvent, drawEvent } from "../logic/events";
import { applyTurnStartItem, availableItems, getItem, itemDropWeight, log, shopStock, tryShield } from "../logic/items";
import {
  bonusRecipients,
  generateDataQuestion,
  leastTargeted,
  resolveQuestion,
  scoreQuestion,
  selectQuestion,
  RECENT_QUESTION_MEMORY,
} from "../logic/questions";
import type { MinigameServices, MiniGameDefinition } from "../minigame/types";
import { withCustomPack } from "../logic/custom";
import { pick, randInt, shuffle, weightedPick, createRng } from "../rng";
import { emit, uid, type EngineContext, type Step } from "./context";
import { fail } from "./errors";
import type {
  Answer,
  BonusStarAward,
  GameEvent,
  GameMode,
  GameState,
  Phase,
  PlayerId,
  QuestionContext,
  QuestionRound,
  ResolvedQuestion,
  RoomState,
} from "./types";
import { emptyStats } from "./types";

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------
export type GameAction =
  | { type: "roll"; playerId: PlayerId; value?: number }
  | { type: "useItem"; playerId: PlayerId; itemId: string; targetId?: PlayerId }
  | { type: "chooseDirection"; playerId: PlayerId; tileId: string }
  | { type: "shopBuy"; playerId: PlayerId; itemId: string }
  | { type: "shopLeave"; playerId: PlayerId }
  | { type: "starBuy"; playerId: PlayerId; buy: boolean }
  /** Gamble / Rest Stop tile: take the offer or not. */
  | { type: "tileChoice"; playerId: PlayerId; accept: boolean }
  | { type: "duelPick"; playerId: PlayerId; opponentId: PlayerId }
  | { type: "answer"; playerId: PlayerId; answer: Answer }
  | { type: "draft"; playerId: PlayerId; answer: Answer }
  | { type: "minigameInput"; playerId: PlayerId; input: unknown }
  | { type: "minigameSubmit"; playerId: PlayerId; submission: unknown }
  | { type: "ready"; playerId: PlayerId }
  | { type: "continue" }
  /** Host: end the game now and go to the results (used for unlimited games). */
  | { type: "finish" };

export interface EngineResult {
  room: RoomState;
  events: GameEvent[];
}

const T = GAME_CONFIG.timers;
const Q = GAME_CONFIG.question;
const M = GAME_CONFIG.minigame;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
interface Draft {
  room: RoomState;
  g: GameState;
  s: Step;
}

function names(room: RoomState): Record<PlayerId, string> {
  return Object.fromEntries(room.players.map((p) => [p.id, p.name]));
}

function activeId(g: GameState): PlayerId {
  return g.order[g.activeIndex];
}

function isConnected(room: RoomState, pid: PlayerId): boolean {
  return room.players.find((p) => p.id === pid)?.connected ?? false;
}

/** Skips within this long after a phase starts are ignored. */
const SKIP_GRACE_MS = 1200;

function goto(d: Draft, phase: Phase, durationMs: number | null) {
  const { g, s } = d;
  g.phase = phase;
  g.ready = [];
  g.phaseStartedAt = s.ctx.now;
  g.phaseEndsAt = durationMs === null ? null : s.ctx.now + durationMs;
  emit(s, { type: "phase", phase });
}

function playerName(d: Draft, pid: PlayerId) {
  return d.room.players.find((p) => p.id === pid)?.name ?? "?";
}

function minigameDef(d: Draft, id: string): MiniGameDefinition {
  const def = d.s.ctx.minigames[id];
  if (!def) throw new Error(`unknown minigame ${id}`);
  return def;
}

// ---------------------------------------------------------------------------
// Game start
// ---------------------------------------------------------------------------
export function createGame(room: RoomState, ctx: EngineContext, mode: GameMode): GameState {
  const content = ctx.content;
  const board = getBoard(content, resolveBoardId(content, room.settings.boardId, ctx.rng));
  const tileTypes = computeTileTypes(board, content, room.settings.tileFrequency ?? {}, ctx.rng);
  const order = shuffle(
    ctx.rng,
    room.players.map((p) => p.id),
  );
  const g: GameState = {
    mode,
    matchId: uid(ctx.rng),
    startedAt: ctx.now,
    phase: "gameStart",
    phaseStartedAt: ctx.now,
    phaseEndsAt: ctx.now + T.gameStartMs,
    round: 1,
    turnCount: room.settings.turnCount,
    order,
    activeIndex: 0,
    players: Object.fromEntries(
      room.players.map((p) => [
        p.id,
        {
          id: p.id,
          coins: GAME_CONFIG.economy.startCoins,
          stars: GAME_CONFIG.economy.startStars,
          tileId: board.startTileId,
          items: [],
          effects: { shield: false },
          stats: emptyStats(),
        },
      ]),
    ),
    boardId: board.id,
    tileTypes,
    bank: 0,
    starTileId: "",
    starVisited: [],
    dice: null,
    pendingDice: null,
    movement: null,
    junction: null,
    tileResult: null,
    question: null,
    shop: null,
    event: null,
    star: null,
    duel: null,
    tileChoice: null,
    tolls: [],
    starSurge: null,
    spotlight: null,
    starNext: null,
    starRadar: [],
    minigame: null,
    targetOverride: null,
    history: { questionIds: [], lastThemeId: null, minigamesPlayed: [], targetCounts: {} },
    bonusStars: null,
    finalRanking: null,
    log: [],
    ready: [],
  };
  placeStar(board, g, ctx.rng);
  return g;
}

export function startGame(
  room: RoomState,
  ctx: EngineContext,
  mode: GameMode = "board",
  opts: { minigameId?: string } = {},
): EngineResult {
  const g = createGame(room, ctx, mode);
  if (mode === "minigameDebug") g.debugMinigameId = opts.minigameId && ctx.minigames[opts.minigameId] ? opts.minigameId : null;
  // Practice modes skip the board-game tutorial.
  if (mode !== "board") g.phaseEndsAt = ctx.now + 1500;
  const next: RoomState = { ...room, stage: "game", game: g, players: room.players.map((p) => ({ ...p, ready: false })) };
  const events: GameEvent[] = [{ type: "phase", phase: "gameStart" }];
  return { room: next, events };
}

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------
function withDraft(room: RoomState, ctx: EngineContext, fn: (d: Draft) => void): EngineResult {
  if (!room.game) fail("WRONG_PHASE", "No game running.");
  const draft = structuredClone(room);
  const d: Draft = { room: draft, g: draft.game!, s: { ctx, events: [] } };
  fn(d);
  return { room: draft, events: d.s.events };
}

export function applyGameAction(room: RoomState, action: GameAction, ctx: EngineContext, isHost = false): EngineResult {
  // While paused nothing moves. Solo mini-game results still count (a phone may submit at its deadline).
  if (room.game?.pause && action.type !== "minigameSubmit") fail("PAUSED", "The game is paused.");
  return withDraft(room, ctx, (d) => handleAction(d, action, isHost));
}

/** Called by the server loop (~15Hz). Handles timeouts, disconnect autoplay and realtime mini-games. */
export function tickGame(room: RoomState, ctx: EngineContext): EngineResult | null {
  const g = room.game;
  if (!g || g.pause) return null;
  const now = ctx.now;
  const needsMinigameTick = g.phase === "minigamePlaying" && g.minigame && ctx.minigames[g.minigame.id]?.tick;
  const timedOut = g.phaseEndsAt !== null && now >= g.phaseEndsAt;
  const autoplay = shouldAutoplay(room, g, now);
  const mgFinished =
    g.phase === "minigamePlaying" && g.minigame && ctx.minigames[g.minigame.id]?.isFinished(g.minigame.state, now);
  if (!needsMinigameTick && !timedOut && !autoplay && !mgFinished) return null;
  return withDraft(room, ctx, (d) => {
    if (d.g.phase === "minigamePlaying" && d.g.minigame) {
      const def = minigameDef(d, d.g.minigame.id);
      if (def.tick) d.g.minigame.state = def.tick(d.g.minigame.state, mgStepCtx(d));
      if (def.isFinished(d.g.minigame.state, now)) return finishMinigame(d);
    }
    if (timedOut || autoplay) onTimeout(d);
  });
}

/** Phases that wait for one specific player (the active one). */
function awaitingActive(phase: Phase): boolean {
  return ["turnStart", "junctionChoice", "shop", "starPurchase", "tileChoice", "duel"].includes(phase);
}

function shouldAutoplay(room: RoomState, g: GameState, now: number): boolean {
  let waitingOn: PlayerId | null = null;
  if (awaitingActive(g.phase)) waitingOn = g.phase === "duel" ? (g.duel?.challengerId ?? null) : activeId(g);
  if (!waitingOn) return false;
  const p = room.players.find((x) => x.id === waitingOn);
  if (!p || p.connected) return false;
  const since = Math.max(g.phaseStartedAt, p.disconnectedAt ?? 0);
  return now - since >= T.disconnectedAutoplayMs;
}

/**
 * Host removes a (disconnected) player during a game. The game continues without them:
 * their turn is skipped, questions and mini-games drop them. With fewer than 2 players left the game ends.
 */
export function removePlayerFromGame(room: RoomState, playerId: PlayerId, ctx: EngineContext): EngineResult {
  return withDraft(room, ctx, (d) => {
    const { g, s } = d;
    const idx = g.order.indexOf(playerId);
    if (idx < 0) fail("UNKNOWN_PLAYER", "That player isn't in this game.");
    const wasActive = idx === g.activeIndex;
    const name = playerName(d, playerId);
    d.room.players = d.room.players.filter((p) => p.id !== playerId);
    if (d.room.hostId === playerId) d.room.hostId = d.room.players[0]?.id ?? null;
    g.order.splice(idx, 1);
    delete g.players[playerId];
    g.ready = g.ready.filter((p) => p !== playerId);
    if (g.targetOverride && (g.targetOverride.targetId === playerId || g.targetOverride.by === playerId)) g.targetOverride = null;
    if (idx < g.activeIndex) g.activeIndex--;
    g.tolls = (g.tolls ?? []).filter((t) => t.ownerId !== playerId);
    if (g.spotlight?.targetId === playerId) g.spotlight = null;
    g.starRadar = (g.starRadar ?? []).filter((p) => p !== playerId);
    for (const b of Object.values(g.question?.boosts ?? {})) if (b.copy === playerId) delete b.copy;
    log(g, s, `${name} was removed from the game.`);

    if (g.order.length < 2) {
      g.question = null;
      g.minigame = null;
      return finishGame(d);
    }

    // Mini-games: they stay in the mini-game's own state but get no placement or coins.
    if (g.minigame) {
      g.minigame.participants = g.minigame.participants.filter((p) => p !== playerId);
      g.minigame.bonuses = g.minigame.bonuses.filter((p) => p !== playerId);
      if (g.minigame.origin === "duel" && g.phase !== "minigameResults" && g.duel && [g.duel.challengerId, g.duel.opponentId].includes(playerId)) {
        g.minigame = null;
        g.duel = null;
        g.question = null;
        if (wasActive) g.activeIndex--;
        return turnEnd(d);
      }
      if (g.minigame.participants.length === 0) {
        g.minigame = null;
        return afterMinigameResults(d);
      }
    }
    // Question rounds
    const q = g.question;
    if (q && q.participants.includes(playerId)) {
      if (q.targetId === playerId) {
        // The question was about them: drop it.
        g.question = null;
        if (g.phase === "minigameQuestion") return goto(d, "minigameCountdown", M.countdownMs);
        if (g.phase === "questionRound" && !wasActive) return turnEnd(d);
      } else {
        q.participants = q.participants.filter((p) => p !== playerId);
        q.revealOrder = q.revealOrder.filter((p) => p !== playerId);
        delete q.answers[playerId];
        delete q.drafts?.[playerId];
        if (q.result) delete q.result.perPlayer[playerId];
        if (q.stage === "answering" || q.stage === "targetAnswering") maybeEndAnswering(d);
      }
    }
    if (g.phase === "duel" && g.duel?.challengerId === playerId) {
      g.duel = null;
      if (wasActive) g.activeIndex--;
      return turnEnd(d);
    }
    // It was their turn: move on to whoever is next.
    if (wasActive && !["roundEnd", "minigameIntro", "minigameQuestion", "minigameCountdown", "minigamePlaying", "minigameResults", "gameEnd", "bonusStars", "podium"].includes(g.phase)) {
      g.activeIndex--;
      g.question = null;
      return goto(d, "turnEnd", T.turnEndMs);
    }
    if (g.activeIndex >= g.order.length) g.activeIndex = 0;
  });
}

/** Re-evaluate after a connection change (e.g. everyone left answered → reveal early). */
export function onConnectionChange(room: RoomState, ctx: EngineContext): EngineResult | null {
  const g = room.game;
  if (!g?.question || (g.question.stage !== "answering" && g.question.stage !== "targetAnswering")) return null;
  return withDraft(room, ctx, (d) => maybeEndAnswering(d));
}

// ---------------------------------------------------------------------------
// Action handling
// ---------------------------------------------------------------------------
function requireActive(d: Draft, pid: PlayerId) {
  if (activeId(d.g) !== pid) fail("NOT_YOUR_TURN", "It's not your turn.");
}
function requirePhase(d: Draft, ...phases: Phase[]) {
  if (!phases.includes(d.g.phase)) fail("WRONG_PHASE", "You can't do that right now.");
}

function handleAction(d: Draft, a: GameAction, isHost: boolean): void {
  const { g } = d;
  switch (a.type) {
    case "roll": {
      requirePhase(d, "turnStart");
      requireActive(d, a.playerId);
      return doRoll(d, a.value);
    }
    case "useItem":
      return useItem(d, a.playerId, a.itemId, a.targetId);
    case "chooseDirection": {
      requirePhase(d, "junctionChoice");
      requireActive(d, a.playerId);
      if (!g.junction?.options.includes(a.tileId)) fail("INVALID_INPUT", "You can't go that way.");
      return takeDirection(d, a.tileId);
    }
    case "shopBuy": {
      requirePhase(d, "shop");
      requireActive(d, a.playerId);
      return shopBuy(d, a.playerId, a.itemId);
    }
    case "shopLeave": {
      requirePhase(d, "shop");
      requireActive(d, a.playerId);
      return leaveShop(d);
    }
    case "ready": {
      requirePhase(d, "gameStart", "minigameIntro");
      if (!g.ready.includes(a.playerId)) g.ready.push(a.playerId);
      // Everyone who's here and needs to read it tapped "Got it!" → move on.
      const needed = (g.phase === "minigameIntro" ? g.minigame!.participants : g.order).filter((p) => isConnected(d.room, p));
      if (needed.every((p) => g.ready.includes(p))) onTimeout(d);
      return;
    }
    case "starBuy": {
      requirePhase(d, "starPurchase");
      requireActive(d, a.playerId);
      return resolveStar(d, a.buy);
    }
    case "tileChoice": {
      requirePhase(d, "tileChoice");
      requireActive(d, a.playerId);
      return resolveTileChoice(d, a.accept);
    }
    case "duelPick": {
      requirePhase(d, "duel");
      if (g.duel?.challengerId !== a.playerId) fail("NOT_YOUR_TURN", "Not your duel.");
      if (a.opponentId === a.playerId || !g.players[a.opponentId]) fail("INVALID_INPUT", "Pick an opponent.");
      return startDuel(d, a.opponentId);
    }
    case "answer":
      return answerQuestion(d, a.playerId, a.answer);
    case "draft": {
      // Remember what a player has selected but not locked in; used when the timer runs out.
      const q = g.question;
      if (!q || (g.phase !== "questionRound" && g.phase !== "minigameQuestion")) return;
      // Guessers draft while guessing, the target while it's their turn.
      if (q.stage !== (a.playerId === q.targetId ? "targetAnswering" : "answering")) return;
      if (!q.participants.includes(a.playerId) || q.answers[a.playerId]) return;
      if (!validateAnswer(q.question, a.answer)) fail("INVALID_INPUT", "Invalid answer.");
      (q.drafts ??= {})[a.playerId] = a.answer;
      return;
    }
    case "minigameInput":
    case "minigameSubmit": {
      requirePhase(d, "minigamePlaying");
      const mg = g.minigame!;
      const def = minigameDef(d, mg.id);
      const allowed = [...mg.participants, ...(def.extraInputPlayers?.(mg.state) ?? [])];
      if (!allowed.includes(a.playerId)) fail("INVALID_INPUT", "You're not in this mini-game.");
      if (a.type === "minigameInput") {
        if (!def.onInput) fail("INVALID_INPUT", "This mini-game takes no input.");
        const parsed = def.inputSchema ? def.inputSchema.safeParse(a.input) : { success: true as const, data: a.input };
        if (!parsed.success) fail("INVALID_INPUT", "Invalid mini-game input.");
        mg.state = def.onInput(mg.state, a.playerId, parsed.data, mgStepCtx(d));
      } else {
        if (!def.onSubmit) fail("INVALID_INPUT", "This mini-game takes no submissions.");
        const parsed = def.submitSchema ? def.submitSchema.safeParse(a.submission) : { success: true as const, data: a.submission };
        if (!parsed.success) fail("INVALID_INPUT", "Invalid mini-game result.");
        mg.state = def.onSubmit(mg.state, a.playerId, parsed.data, mgStepCtx(d));
      }
      if (def.isFinished(mg.state, d.s.ctx.now)) finishMinigame(d);
      return;
    }
    case "continue": {
      if (!isHost) fail("NOT_HOST", "Only the host can skip.");
      // A second tap on the Skip button (it sits in the same spot on consecutive screens) must not
      // skip the next screen right away.
      // Mini-game results open with the outcome screen: that part can't be skipped.
      const grace = g.phase === "minigameResults" ? M.outcomeMs + SKIP_GRACE_MS : SKIP_GRACE_MS;
      if (d.s.ctx.now - g.phaseStartedAt < grace) return;
      const skippable: Phase[] = ["gameStart", "tileEffect", "event", "roundEnd", "minigameIntro", "minigameResults", "gameEnd", "bonusStars", "turnEnd"];
      if (skippable.includes(g.phase)) return onTimeout(d);
      if ((g.phase === "questionRound" || g.phase === "minigameQuestion") && g.question?.stage !== "answering" && g.question?.stage !== "targetAnswering")
        return onTimeout(d);
      fail("WRONG_PHASE", "Nothing to skip.");
    }
    case "finish": {
      if (!isHost) fail("NOT_HOST", "Only the host can finish the game.");
      if (g.mode !== "board") fail("WRONG_PHASE", "Practice modes are ended from the menu.");
      if (g.phase === "gameEnd" || g.phase === "bonusStars" || g.phase === "podium") fail("WRONG_PHASE", "The game is already over.");
      // Drop whatever was in progress; results are computed from what has been earned so far.
      g.question = null;
      g.minigame = null;
      g.movement = null;
      g.junction = null;
      g.shop = null;
      g.star = null;
      g.duel = null;
      g.event = null;
      return goto(d, "gameEnd", T.gameEndMs);
    }
  }
}

// ---------------------------------------------------------------------------
// Timeouts: the default action of every phase
// ---------------------------------------------------------------------------
function onTimeout(d: Draft) {
  const { g, s } = d;
  switch (g.phase) {
    case "gameStart":
      if (g.mode === "questionDebug") return startQuestionRound(d, "debug", pickDebugTarget(d));
      if (g.mode === "minigameDebug") return startRoundMinigame(d);
      return turnStart(d);
    case "turnStart":
      return doRoll(d, g.pendingDice?.kind === "custom" ? randInt(s.ctx.rng, 1, 6) : undefined);
    case "rolling":
      g.movement = { remaining: g.dice!.total, path: [], next: "landed" };
      return advanceMovement(d);
    case "moving":
      return afterMovement(d);
    case "junctionChoice":
      return takeDirection(d, pick(s.ctx.rng, g.junction!.options));
    case "tileEffect":
      // A Warp Pipe (or a frozen turn) may have left you on the star.
      if (offerDroppedStar(d, "turnEnd")) return;
      return turnEnd(d);
    case "tileChoice":
      return resolveTileChoice(d, false);
    case "event":
      if (offerDroppedStar(d, "turnEnd")) return;
      return turnEnd(d);
    case "questionRound":
    case "minigameQuestion":
      return advanceQuestionStage(d);
    case "shop":
      return leaveShop(d);
    case "starPurchase": {
      const p = g.players[activeId(g)];
      return resolveStar(d, p.coins >= starPriceFor(d, p.id));
    }
    case "duel": {
      const others = g.order.filter((p) => p !== g.duel!.challengerId);
      return startDuel(d, pick(s.ctx.rng, others));
    }
    case "turnEnd":
      return nextTurn(d);
    case "roundEnd":
      return startRoundMinigame(d);
    case "minigameIntro":
      return afterMinigameIntro(d);
    case "minigameCountdown":
      return startMinigamePlay(d);
    case "minigamePlaying": {
      const mg = g.minigame!;
      const def = minigameDef(d, mg.id);
      if (def.onTimeout) mg.state = def.onTimeout(mg.state, mgStepCtx(d));
      return finishMinigame(d);
    }
    case "minigameResults":
      return afterMinigameResults(d);
    case "gameEnd":
      return startBonusStars(d);
    case "bonusStars":
      return revealNextBonusStar(d);
    case "podium":
      return;
  }
}

// ---------------------------------------------------------------------------
// Turn flow
// ---------------------------------------------------------------------------
function turnStart(d: Draft) {
  const { g } = d;
  g.dice = null;
  g.pendingDice = null;
  g.movement = null;
  g.junction = null;
  g.tileResult = null;
  g.shop = null;
  g.event = null;
  g.star = null;
  g.duel = null;
  g.tileChoice = null;
  g.question = null;
  g.diceBonus = 0;
  const p = g.players[activeId(g)];
  if (p.effects.frozen) {
    // Freeze item: this turn is skipped.
    p.effects.frozen = false;
    g.tileResult = { tileId: p.tileId, type: "frozen", text: `${playerName(d, p.id)} is frozen solid and skips this turn!` };
    emit(d.s, { type: "sfx", id: "bad" });
    log(g, d.s, g.tileResult.text!, p.id);
    return goto(d, "tileEffect", T.tileEffectMs + 800);
  }
  if (offerDroppedStar(d, "turnStart")) return;
  goto(d, "turnStart", T.turnStartMs);
}

/** Remember who a teleport/swap/push put on the star tile (or moved off it), compared to `before`. */
function noteDroppedOnStar(g: GameState, before: Record<PlayerId, string>) {
  for (const p of Object.values(g.players)) {
    if (before[p.id] === undefined || before[p.id] === p.tileId) continue;
    if (p.tileId === g.starTileId) p.effects.onStar = true;
    else delete p.effects.onStar;
  }
}

function tilesNow(g: GameState): Record<PlayerId, string> {
  return Object.fromEntries(Object.values(g.players).map((p) => [p.id, p.tileId]));
}

/**
 * The active player was put on the star without walking there: offer it (if they can afford it)
 * before they move on. `resume` is where the turn continues afterwards. Returns true if offered.
 */
function offerDroppedStar(d: Draft, resume: "turnStart" | "turnEnd"): boolean {
  const { g } = d;
  const p = g.players[activeId(g)];
  if (!p?.effects.onStar) return false;
  delete p.effects.onStar;
  if (p.tileId !== g.starTileId || p.coins < starPriceFor(d, p.id)) return false;
  g.star = { passing: false, dropped: resume };
  goto(d, "starPurchase", T.starPurchaseMs);
  return true;
}

function doRoll(d: Draft, value?: number) {
  const { g, s } = d;
  const rng = s.ctx.rng;
  const pid = activeId(g);
  let values: number[];
  let kind: "normal" | "double" | "custom" = "normal";
  const sides = GAME_CONFIG.dice.sides;
  if (g.pendingDice?.kind === "custom") {
    kind = "custom";
    values = [Math.min(sides, Math.max(1, value ?? randInt(rng, 1, sides)))];
  } else if (g.pendingDice?.kind === "double") {
    kind = "double";
    values = Array.from({ length: g.pendingDice.count ?? 2 }, () => randInt(rng, 1, sides));
  } else {
    values = [randInt(rng, 1, sides)];
  }
  const bonus = g.diceBonus ?? 0;
  g.dice = { values, total: values.reduce((a, b) => a + b, 0) + bonus, kind, bonus: bonus || undefined };
  g.pendingDice = null;
  g.diceBonus = 0;
  emit(s, { type: "diceRolled", playerId: pid, values });
  goto(d, "rolling", T.rollingMs);
}

/** Walk until done, a junction, or passing the star. */
function advanceMovement(d: Draft) {
  const { g, s } = d;
  const board = getBoard(s.ctx.content, g.boardId);
  const pid = activeId(g);
  const p = g.players[pid];
  const mv = g.movement!;
  const path: string[] = [];
  let stop: "junction" | "starPass" | "shopPass" | "landed" = "landed";
  while (mv.remaining > 0) {
    const options = nextTiles(board, p.tileId);
    let to: string;
    if (options.length > 1) {
      if (!mv.chosen || !options.includes(mv.chosen)) {
        stop = "junction";
        break;
      }
      to = mv.chosen;
      delete mv.chosen;
    } else to = options[0];
    p.tileId = to;
    delete p.effects.onStar;
    mv.remaining--;
    payToll(d, pid, to);
    path.push(to);
    p.stats.stepsMoved++;
    // Passing (or landing on) Start pays a lap bonus.
    const stepDef = tileDef(s.ctx.content, g.tileTypes[to] ?? getTile(board, to).type);
    const lapCoins = stepDef?.params?.passCoins ?? 0;
    if (lapCoins > 0) {
      changeCoins(g, s, pid, lapCoins, "tile:start");
      emit(s, { type: "sfx", id: "coin" });
      log(g, s, `${playerName(d, pid)} passed Start: +${lapCoins} coins`, pid);
    }
    // Walking past the star: stop to buy it, but only if you can afford it.
    if (to === g.starTileId && mv.remaining > 0 && p.coins >= starPriceFor(d, pid)) {
      stop = "starPass";
      break;
    }
    // Walking past a Shop: stop to buy if you can afford something (like the star).
    if (mv.remaining > 0 && isShopTile(d, to) && canShop(d, pid)) {
      stop = "shopPass";
      break;
    }
  }
  mv.path = path;
  mv.next = stop;
  if (path.length) {
    emit(s, { type: "tokenMoved", playerId: pid, path });
    goto(d, "moving", path.length * T.hopMs + 250);
  } else afterMovement(d);
}

function afterMovement(d: Draft) {
  const { g, s } = d;
  const board = getBoard(s.ctx.content, g.boardId);
  const p = g.players[activeId(g)];
  const mv = g.movement!;
  if (mv.next === "junction") {
    g.junction = { tileId: p.tileId, options: nextTiles(board, p.tileId) };
    return goto(d, "junctionChoice", T.junctionMs);
  }
  if (mv.next === "starPass") {
    g.star = { passing: true };
    return goto(d, "starPurchase", T.starPurchaseMs);
  }
  if (mv.next === "shopPass") {
    g.shop = { stock: shopStock(s.ctx.content, s, g), bought: [], passing: true };
    return goto(d, "shop", T.shopMs);
  }
  return land(d);
}

function isShopTile(d: Draft, tileId: string): boolean {
  const type = d.g.tileTypes[tileId];
  return !!type && tileDef(d.s.ctx.content, type).effect === "shop";
}

function canShop(d: Draft, pid: PlayerId): boolean {
  const p = d.g.players[pid];
  const cheapest = Math.min(...d.s.ctx.content.items.map((i) => itemPrice(i, d.g.order.length)));
  return p.items.length < GAME_CONFIG.economy.maxItems && p.coins >= cheapest;
}

/** Leaving the shop: keep walking if we only stopped while passing it. */
function leaveShop(d: Draft) {
  const { g } = d;
  const passing = g.shop?.passing;
  g.shop = null;
  if (passing && g.movement && g.movement.remaining > 0) return advanceMovement(d);
  return turnEnd(d);
}

function takeDirection(d: Draft, tileId: string) {
  const { g } = d;
  g.movement!.chosen = tileId;
  g.junction = null;
  advanceMovement(d);
}

/** Toll Booth on this tile (someone else's): pay up. */
function payToll(d: Draft, pid: PlayerId, tileId: string) {
  const { g, s } = d;
  const toll = g.tolls?.find((t) => t.tileId === tileId && t.ownerId !== pid && g.players[t.ownerId]);
  if (!toll) return;
  const paid = transferCoins(g, s, pid, toll.ownerId, toll.amount, "toll");
  if (paid > 0) {
    emit(s, { type: "sfx", id: "coin" });
    log(g, s, `${playerName(d, pid)} paid ${paid} coins at ${playerName(d, toll.ownerId)}'s Toll Booth.`, pid);
  }
}

/** `starDone`: the star on this tile was already offered; go on with the tile's own effect. */
function land(d: Draft, starDone = false) {
  const { g, s } = d;
  const pid = activeId(g);
  const p = g.players[pid];
  // Landing on someone else's Toll Booth (after paying) tears it down.
  const torn = g.tolls?.filter((t) => t.tileId === p.tileId && t.ownerId !== pid) ?? [];
  if (torn.length) {
    g.tolls = g.tolls!.filter((t) => !torn.includes(t));
    log(g, s, `${playerName(d, pid)} tore down ${playerName(d, torn[0].ownerId)}'s Toll Booth.`, pid);
  }
  if (p.tileId === g.starTileId && !starDone) {
    g.star = { passing: false };
    return goto(d, "starPurchase", T.starPurchaseMs);
  }
  const type = g.tileTypes[p.tileId] ?? getTile(getBoard(s.ctx.content, g.boardId), p.tileId).type;
  const def = tileDef(s.ctx.content, type);
  g.tileResult = { tileId: p.tileId, type };
  switch (def.effect) {
    case "coins": {
      const amount = def.params.amount ?? 0;
      const delta = changeCoins(g, s, pid, amount, `tile:${type}`);
      g.tileResult.coinsDelta = delta;
      // Coins lost on red tiles feed the Piggy Bank (if this map has one).
      if (delta < 0 && Object.values(g.tileTypes).some((t) => tileDef(s.ctx.content, t)?.effect === "bank")) g.bank += -delta;
      if (amount > 0) p.stats.blueTiles++;
      else p.stats.redTiles++;
      emit(s, { type: "sfx", id: amount > 0 ? "coin" : "bad" });
      return goto(d, "tileEffect", T.tileEffectMs);
    }
    case "item": {
      // Free random item; a full bag gets coins instead.
      if (p.items.length < GAME_CONFIG.economy.maxItems) {
        const playerCount = Object.keys(g.players).length;
        const item = weightedPick(s.ctx.rng, availableItems(s.ctx.content, g), (i) => itemDropWeight(i, playerCount))!;
        p.items.push(item.id);
        g.tileResult.itemId = item.id;
        emit(s, { type: "itemGained", playerId: pid, itemId: item.id });
        emit(s, { type: "sfx", id: "buy" });
        log(g, s, `${playerName(d, pid)} found a ${localize(item.name)}!`, pid);
      } else {
        g.tileResult.itemId = null;
        g.tileResult.coinsDelta = changeCoins(g, s, pid, def.params.fallbackCoins ?? 3, "tile:item");
      }
      return goto(d, "tileEffect", T.tileEffectMs + 800);
    }
    case "lucky": {
      const roll = randInt(s.ctx.rng, 1, GAME_CONFIG.dice.sides);
      g.tileResult.roll = roll;
      g.tileResult.coinsDelta = changeCoins(g, s, pid, roll * (def.params.multiplier ?? 2), "tile:lucky");
      p.stats.blueTiles++;
      emit(s, { type: "diceRolled", playerId: pid, values: [roll] });
      return goto(d, "tileEffect", T.tileEffectMs + 1200);
    }
    case "bank": {
      const pot = g.bank;
      g.bank = 0;
      g.tileResult.coinsDelta = changeCoins(g, s, pid, pot, "tile:bank");
      g.tileResult.text = pot > 0 ? `${playerName(d, pid)} cracked the Piggy Bank: ${pot} coins!` : "The Piggy Bank is empty… for now.";
      if (pot > 0) emit(s, { type: "sfx", id: "fanfare" });
      log(g, s, g.tileResult.text, pid);
      return goto(d, "tileEffect", T.tileEffectMs + 800);
    }
    case "thief": {
      const others = g.order.filter((x) => x !== pid);
      const victim = pick(s.ctx.rng, others);
      if (tryShield(g, s, victim)) {
        g.tileResult.text = `${playerName(d, victim)}'s shield stopped the thief!`;
      } else {
        const taken = transferCoins(g, s, victim, pid, def.params.amount ?? 4, "steal");
        if (taken > 0) {
          p.stats.steals++;
          g.players[victim].stats.stolenFrom++;
        }
        g.tileResult.text = `${playerName(d, pid)} stole ${taken} coins from ${playerName(d, victim)}!`;
        emit(s, { type: "sfx", id: "steal" });
      }
      log(g, s, g.tileResult.text, pid);
      return goto(d, "tileEffect", T.tileEffectMs + 800);
    }
    case "mindReader": {
      // Only the landing player guesses, about someone else, for double coins.
      const others = g.order.filter((x) => x !== pid);
      const target = leastTargeted(s.ctx.rng, others, g.history.targetCounts);
      return startQuestionRound(d, "mindReader", target, { participants: [pid, target], multiplier: def.params.multiplier ?? 2 });
    }
    case "question":
      return startQuestionRound(d, "tile", pid);
    case "data":
      return startQuestionRound(d, "dataTile", pid);
    case "event": {
      const card = drawEvent(s);
      p.stats.eventsDrawn++;
      const before = tilesNow(g);
      const res = applyEvent(g, s, card, pid, names(d.room));
      noteDroppedOnStar(g, before);
      g.event = { cardId: card.id, ...res };
      log(g, s, res.text, pid);
      emit(s, { type: "eventDrawn", cardId: card.id });
      return goto(d, "event", T.eventMs);
    }
    case "shop":
      g.shop = { stock: shopStock(s.ctx.content, s, g), bought: [] };
      return goto(d, "shop", T.shopMs);
    case "duel": {
      if (!s.ctx.minigames.duel) return goto(d, "tileEffect", 900);
      g.duel = { challengerId: pid, opponentId: null };
      const others = g.order.filter((x) => x !== pid);
      if (others.length === 1) return startDuel(d, others[0]);
      return goto(d, "duel", T.duelPickMs);
    }
    case "gamble": {
      const stake = Math.min(def.params.max ?? 20, Math.floor(p.coins / 2));
      if (stake < 1) {
        g.tileResult.text = `${playerName(d, pid)} has nothing to bet.`;
        return goto(d, "tileEffect", T.tileEffectMs);
      }
      g.tileChoice = { kind: "gamble", amount: stake };
      return goto(d, "tileChoice", T.tileChoiceMs);
    }
    case "restStop": {
      const cost = def.params.cost ?? 3;
      if (p.coins < cost) {
        g.tileResult.text = `${playerName(d, pid)} can't afford the Rest Stop (${cost} coins).`;
        return goto(d, "tileEffect", T.tileEffectMs);
      }
      g.tileChoice = { kind: "restStop", amount: cost };
      return goto(d, "tileChoice", T.tileChoiceMs);
    }
    case "warp": {
      const dest = getTile(getBoard(s.ctx.content, g.boardId), p.tileId).warpTo;
      if (!dest) return goto(d, "tileEffect", 900);
      const before = tilesNow(g);
      p.tileId = dest;
      noteDroppedOnStar(g, before);
      emit(s, { type: "tokenTeleported", playerId: pid, tileId: dest });
      emit(s, { type: "sfx", id: "whoosh" });
      g.tileResult.text = `${playerName(d, pid)} went down the Warp Pipe!`;
      log(g, s, g.tileResult.text, pid);
      return goto(d, "tileEffect", T.tileEffectMs);
    }
    case "none":
    default:
      return goto(d, "tileEffect", 900);
  }
}

/** Gamble: double or nothing on the stake. Rest Stop: pay and roll again right away. */
function resolveTileChoice(d: Draft, accept: boolean) {
  const { g, s } = d;
  const pid = activeId(g);
  const choice = g.tileChoice;
  g.tileChoice = null;
  if (!choice || !g.tileResult) return turnEnd(d);
  const name = playerName(d, pid);
  if (choice.kind === "gamble") {
    if (!accept) {
      g.tileResult.text = `${name} walked away from the table.`;
      return goto(d, "tileEffect", 1400);
    }
    const won = s.ctx.rng() < 0.5;
    const delta = changeCoins(g, s, pid, won ? choice.amount : -choice.amount, "tile:gamble");
    if (delta < 0 && Object.values(g.tileTypes).some((t) => tileDef(s.ctx.content, t)?.effect === "bank")) g.bank += -delta;
    g.tileResult.coinsDelta = delta;
    g.tileResult.text = won ? `${name} doubled up: +${delta} coins!` : `${name} lost the bet: ${delta} coins.`;
    emit(s, { type: "sfx", id: won ? "fanfare" : "bad" });
    log(g, s, g.tileResult.text, pid);
    return goto(d, "tileEffect", T.tileEffectMs);
  }
  if (!accept) return turnEnd(d);
  changeCoins(g, s, pid, -choice.amount, "tile:restStop");
  log(g, s, `${name} paid ${choice.amount} coins at the Rest Stop to roll again.`, pid);
  g.tileResult = null;
  return doRoll(d);
}

function resolveStar(d: Draft, buy: boolean) {
  const { g, s } = d;
  const pid = activeId(g);
  const p = g.players[pid];
  const coupon = couponFor(d, pid);
  const cost = starPriceFor(d, pid);
  if (buy && p.coins >= cost) {
    if (coupon) p.items.splice(p.items.indexOf(coupon), 1);
    changeCoins(g, s, pid, -cost, "star");
    changeStars(g, s, pid, 1, "bought");
    p.stats.starsBought++;
    log(g, s, `${playerName(d, pid)} bought a star for ${cost} coins!`, pid, "star");
    emit(s, { type: "sfx", id: "star" });
    placeStar(getBoard(s.ctx.content, g.boardId), g, s.ctx.rng);
    emit(s, { type: "starMoved", tileId: g.starTileId });
    if (checkStarGoal(d, pid)) return;
  }
  const passing = g.star?.passing;
  const dropped = g.star?.dropped;
  g.star = null;
  delete p.effects.onStar;
  if (dropped === "turnStart") return goto(d, "turnStart", T.turnStartMs);
  if (dropped === "turnEnd") return turnEnd(d);
  if (passing && g.movement && g.movement.remaining > 0) {
    // The star sat on a Shop we're walking past: offer the shop too.
    if (isShopTile(d, p.tileId) && canShop(d, pid)) {
      g.shop = { stock: shopStock(s.ctx.content, s, g), bought: [], passing: true };
      return goto(d, "shop", T.shopMs);
    }
    return advanceMovement(d);
  }
  // Landed on the star: the tile's own effect still happens afterwards.
  return land(d, true);
}

/** Star race: reaching the goal ends the game on the spot. */
function checkStarGoal(d: Draft, pid: PlayerId): boolean {
  const { g, s } = d;
  const goal = d.room.settings.starGoal ?? 0;
  if (goal <= 0 || g.players[pid].stars < goal || g.starGoalWinner) return false;
  g.starGoalWinner = pid;
  g.star = null;
  log(g, s, `${playerName(d, pid)} reached ${goal} stars and wins!`, pid);
  goto(d, "gameEnd", T.gameEndMs);
  return true;
}

/** Star Coupon held by the player (used automatically when buying a star). */
function couponFor(d: Draft, pid: PlayerId): string | undefined {
  const ids = d.s.ctx.content.items.filter((i) => i.effect === "starCoupon").map((i) => i.id);
  return d.g.players[pid].items.find((i) => ids.includes(i));
}

/** Star price with a Star Coupon in `items` and an active Star Surge (see `starSurcharge`). */
export function starPrice(content: Pick<ContentBundle, "items">, items: string[], surcharge = 0): number {
  const coupon = content.items.find((i) => i.effect === "starCoupon" && items.includes(i.id));
  return Math.max(0, GAME_CONFIG.economy.starCost + surcharge - (coupon?.params.discount ?? 0));
}

/** Extra star cost from a Star Surge event this round. */
export function starSurcharge(g: Pick<GameState, "starSurge" | "round">): number {
  return g.starSurge && g.starSurge.round === g.round ? g.starSurge.extra : 0;
}

function starPriceFor(d: Draft, pid: PlayerId): number {
  return starPrice(d.s.ctx.content, d.g.players[pid].items, starSurcharge(d.g));
}

function shopBuy(d: Draft, pid: PlayerId, itemId: string) {
  const { g, s } = d;
  if (!g.shop?.stock.includes(itemId)) fail("INVALID_INPUT", "That's not for sale here.");
  const item = getItem(s.ctx.content, itemId);
  const p = g.players[pid];
  if (p.items.length >= GAME_CONFIG.economy.maxItems) fail("INVENTORY_FULL", "You can only carry 3 items.");
  const price = itemPrice(item, g.order.length);
  if (p.coins < price) fail("NOT_ENOUGH_COINS", "Not enough coins.");
  changeCoins(g, s, pid, -price, "shop");
  p.items.push(itemId);
  g.shop.bought.push(itemId);
  log(g, s, `${playerName(d, pid)} bought ${localize(item.name)} for ${price} coins.`, pid, "shop");
  emit(s, { type: "itemBought", playerId: pid, itemId });
  emit(s, { type: "sfx", id: "buy" });
}

function useItem(d: Draft, pid: PlayerId, itemId: string, targetId?: PlayerId) {
  const { g, s } = d;
  const p = g.players[pid];
  if (!p) fail("UNKNOWN_PLAYER", "Unknown player.");
  const idx = p.items.indexOf(itemId);
  if (idx < 0) fail("INVALID_INPUT", "You don't have that item.");
  const item = getItem(s.ctx.content, itemId);
  if (item.useTiming === "passive") fail("INVALID_INPUT", `${localize(item.name)} works automatically.`);
  if (item.useTiming === "turnStart") {
    requirePhase(d, "turnStart");
    requireActive(d, pid);
    const before = tilesNow(g);
    const did = applyTurnStartItem(g, s, pid, item, targetId, names(d.room));
    noteDroppedOnStar(g, before);
    logItemUse(d, pid, localize(item.name), targetId, did);
    if (checkStarGoal(d, pid)) {
      p.items.splice(p.items.indexOf(itemId), 1);
      return;
    }
  } else {
    // onQuestion: during the answering stage of a round you're guessing in, before locking in.
    const q = g.question;
    if (!q || q.stage !== "answering" || (g.phase !== "questionRound" && g.phase !== "minigameQuestion"))
      fail("WRONG_PHASE", "Use this during a question.");
    if (!q.participants.includes(pid) || q.targetId === pid) fail("INVALID_INPUT", "Only guessers can use this.");
    if (q.answers[pid]) fail("INVALID_INPUT", "You already locked in.");
    const boost = (q.boosts[pid] ??= {});
    let did: string;
    if (item.effect === "peek") {
      if (!getFormat(q.question.format).discrete) fail("INVALID_INPUT", "Peek only works on multiple-choice questions.");
      boost.peek = true;
      did = "ruled out wrong answers";
    } else if (item.effect === "luckyCharm") {
      if (!q.payCoins) fail("INVALID_INPUT", "No coins in this question to double.");
      boost.double = true;
      did = "doubles their coins for this question";
    } else if (item.effect === "copycat") {
      if (!targetId || targetId === pid || targetId === q.targetId || !q.participants.includes(targetId))
        fail("INVALID_INPUT", "Pick another guesser to copy.");
      boost.copy = targetId;
      delete q.drafts?.[pid];
      did = `copies ${playerName(d, targetId)}'s answer`;
    } else if (item.effect === "wideTolerance") {
      if (!getFormat(q.question.format).usesTolerance) fail("INVALID_INPUT", "Only works on number questions.");
      boost.wide = true;
      did = "gets a wider margin on this guess";
    } else fail("INVALID_INPUT", "Can't use that now.");
    logItemUse(d, pid, localize(item.name), undefined, did);
  }
  // Some items change the bag (Swapper), so look the item up again.
  p.items.splice(p.items.includes(itemId) ? p.items.indexOf(itemId) : idx, 1);
  p.stats.itemsUsed++;
  emit(s, { type: "itemUsed", playerId: pid, itemId, targetId });
  // A swap put you on the star: buy it before you roll.
  if (item.useTiming === "turnStart") offerDroppedStar(d, "turnStart");
}

function logItemUse(d: Draft, pid: PlayerId, itemName: string, targetId: PlayerId | undefined, did: string) {
  const on = targetId ? ` on ${playerName(d, targetId)}` : "";
  log(d.g, d.s, `${playerName(d, pid)} used ${itemName}${on}: ${did}.`, pid, "item");
}

function turnEnd(d: Draft) {
  goto(d, "turnEnd", T.turnEndMs);
}

function nextTurn(d: Draft) {
  const { g } = d;
  g.activeIndex++;
  if (g.activeIndex >= g.order.length) {
    g.activeIndex = 0;
    g.question = null;
    return goto(d, "roundEnd", T.roundEndMs);
  }
  turnStart(d);
}

// ---------------------------------------------------------------------------
// Question rounds
// ---------------------------------------------------------------------------
function pickDebugTarget(d: Draft): PlayerId {
  return leastTargeted(d.s.ctx.rng, d.g.order, d.g.history.targetCounts);
}

function questionServices(d: Draft): MinigameServices {
  const { g, s, room } = d;
  const nm = names(room);
  return {
    language: room.settings.language,
    names: nm,
    allPlayers: [...g.order],
    coins: Object.fromEntries(Object.values(g.players).map((p) => [p.id, p.coins])),
    pickQuestion: (opts) => {
      const participants = opts.participants ?? g.order;
      if (opts.allowData && room.settings.dataQuestions) {
        const dq = generateDataQuestion({
          targetId: opts.targetId,
          data: s.ctx.playerData,
          names: nm,
          generators: s.ctx.generators,
          content: s.ctx.content,
          history: g.history,
          rng: s.ctx.rng,
          formats: opts.formats,
        });
        if (dq) {
          g.history.questionIds.push(dq.id);
          rememberAsked(room, dq.id);
          return dq;
        }
      }
      const sel = selectQuestion({
        content: withCustomPack(s.ctx.content, room),
        settings: room.settings,
        history: g.history,
        rng: s.ctx.rng,
        usage: opts.usage,
        playerCount: participants.length,
        formats: opts.formats,
        tags: opts.tags,
        recentIds: room.askedQuestionIds,
      });
      if (!sel) return null;
      g.history.questionIds.push(sel.question.id);
      rememberAsked(room, sel.question.id);
      const rq = resolveQuestion(sel.question, sel.pack, {
        targetId: opts.targetId,
        names: nm,
        participants,
        rng: s.ctx.rng,
        language: room.settings.language,
      });
      g.history.lastThemeId = rq.themeId;
      return rq;
    },
    scoreAnswers: (question, targetId, participants, answers) =>
      scoreQuestion({ question, targetId, participants, answers, payCoins: false }),
    validateAnswer,
    leastTargeted: (cands) => leastTargeted(s.ctx.rng, cands, g.history.targetCounts),
    noteTargeted: (pid) => {
      g.history.targetCounts[pid] = (g.history.targetCounts[pid] ?? 0) + 1;
    },
  };
}

/** Remember a question across games in this room (most recent last, bounded). */
function rememberAsked(room: RoomState, id: string) {
  const list = (room.askedQuestionIds ?? []).filter((x) => x !== id);
  list.push(id);
  room.askedQuestionIds = list.slice(-RECENT_QUESTION_MEMORY);
}

function startQuestionRound(
  d: Draft,
  context: QuestionContext,
  targetId: PlayerId,
  opts: { participants?: PlayerId[]; multiplier?: number } = {},
) {
  const { g, s } = d;
  // Pick the Target item overrides the next round's target.
  if (g.targetOverride && context !== "debug" && context !== "mindReader") {
    targetId = g.targetOverride.targetId;
    g.targetOverride = null;
  } else if (g.spotlight && context !== "debug" && context !== "mindReader" && g.players[g.spotlight.targetId]) {
    // Spotlight event: the next questions are about this player.
    targetId = g.spotlight.targetId;
    g.spotlight = --g.spotlight.left > 0 ? g.spotlight : null;
  }
  const services = questionServices(d);
  const usage = context === "minigameIntro" ? "minigameIntro" : "tile";
  const wantsData = context === "dataTile";
  let question: ResolvedQuestion | null = null;
  const participants = opts.participants ?? [...g.order];
  // With only two people answering, "pick a player" questions make no sense.
  const formats = participants.length < g.order.length || participants.length < 3 ? ["tiles", "number", "scale", "higherLower", "ranking"] : undefined;
  if (wantsData) question = services.pickQuestion({ targetId, usage, allowData: true, participants, formats });
  else question = services.pickQuestion({ targetId, usage, participants, formats });
  if (!question) {
    // No content available at all: skip gracefully.
    log(g, s, "No questions available for the enabled themes.");
    return context === "minigameIntro" ? goto(d, "minigameCountdown", M.countdownMs) : turnEnd(d);
  }
  services.noteTargeted(targetId);
  g.players[targetId].stats.timesTarget++;
  const round: QuestionRound = {
    uid: uid(s.ctx.rng),
    context: context === "dataTile" && !question.isData ? "tile" : context,
    targetId,
    participants,
    question,
    stage: "intro",
    stageStartedAt: s.ctx.now,
    stageEndsAt: s.ctx.now + Q.introMs,
    answers: {},
    answeredAt: {},
    boosts: {},
    result: null,
    revealOrder: [...shuffle(s.ctx.rng, participants.filter((p) => p !== targetId)), targetId],
    multiplier: question.isData ? Q.dataMultiplier : (opts.multiplier ?? 1),
    payCoins: context !== "minigameIntro",
  };
  g.question = round;
  goto(d, context === "minigameIntro" ? "minigameQuestion" : "questionRound", Q.introMs);
}

function setStage(d: Draft, stage: QuestionRound["stage"], ms: number) {
  const q = d.g.question!;
  q.stage = stage;
  q.stageStartedAt = d.s.ctx.now;
  q.stageEndsAt = d.s.ctx.now + ms;
  d.g.phaseStartedAt = d.s.ctx.now;
  d.g.phaseEndsAt = q.stageEndsAt;
}

function answerQuestion(d: Draft, pid: PlayerId, answer: Answer): void {
  const { g, s } = d;
  const q = g.question;
  if (!q || (g.phase !== "questionRound" && g.phase !== "minigameQuestion")) {
    // Question-only mini-games route answers through minigame input.
    if (g.phase === "minigamePlaying") return handleAction(d, { type: "minigameInput", playerId: pid, input: { answer } }, false);
    fail("WRONG_PHASE", "No question right now.");
  }
  if (!q.participants.includes(pid)) fail("INVALID_INPUT", "You're not answering this one.");
  if (q.stage === "answering" && pid === q.targetId) fail("WRONG_PHASE", "Wait until everyone else has answered.");
  if (q.stage === "targetAnswering" && pid !== q.targetId) fail("WRONG_PHASE", "Answers are closed.");
  if (q.stage !== "answering" && q.stage !== "targetAnswering") fail("WRONG_PHASE", "Answers are closed.");
  if (q.answers[pid]) fail("INVALID_INPUT", "Already locked in.");
  if (q.boosts[pid]?.copy) fail("INVALID_INPUT", "You're copying someone this round.");
  if (!validateAnswer(q.question, answer)) fail("INVALID_INPUT", "Invalid answer.");
  q.answers[pid] = answer;
  q.answeredAt[pid] = s.ctx.now;
  emit(s, { type: "answerLocked", playerId: pid });
  maybeEndAnswering(d);
}

/** Guessers first; once they're all in (or time's up) the target answers; then the reveal. */
function maybeEndAnswering(d: Draft) {
  const q = d.g.question!;
  if (q.stage === "answering") {
    const waiting = q.participants.filter((p) => p !== q.targetId && !q.answers[p] && !q.boosts[p]?.copy && isConnected(d.room, p));
    if (waiting.length === 0) enterTargetAnswering(d);
  } else if (q.stage === "targetAnswering") {
    if (q.answers[q.targetId] || !isConnected(d.room, q.targetId)) enterReveal(d);
  }
}

/** Whatever these players had selected (but not locked in) counts as their answer. */
function commitDrafts(d: Draft, who: PlayerId[]) {
  const q = d.g.question!;
  for (const pid of who) {
    const draft = q.drafts?.[pid];
    if (draft && !q.answers[pid] && q.participants.includes(pid)) {
      q.answers[pid] = draft;
      q.answeredAt[pid] = d.s.ctx.now;
    }
    if (q.drafts) delete q.drafts[pid];
  }
}

function enterTargetAnswering(d: Draft) {
  const q = d.g.question!;
  commitDrafts(d, q.participants.filter((p) => p !== q.targetId));
  if (!q.participants.includes(q.targetId) || q.answers[q.targetId] || !isConnected(d.room, q.targetId)) return enterReveal(d);
  setStage(d, "targetAnswering", Q.targetAnswerMs);
  emit(d.s, { type: "sfx", id: "drumroll" });
}

function advanceQuestionStage(d: Draft) {
  const q = d.g.question!;
  switch (q.stage) {
    case "intro":
      return setStage(d, "answering", Q.answerMs);
    case "answering":
      return enterTargetAnswering(d);
    case "targetAnswering":
      return enterReveal(d);
    case "reveal":
      return enterResults(d);
    case "results":
      return questionDone(d);
  }
}

function enterReveal(d: Draft) {
  const { g, s } = d;
  const q = g.question!;
  // Time's up: whatever someone had selected counts as their answer.
  commitDrafts(d, q.participants);
  q.drafts = {};
  // Copycat: take the copied player's answer (copies of copies work; a loop gets nothing).
  for (let pass = 0; pass < q.participants.length; pass++) {
    for (const [pid, b] of Object.entries(q.boosts)) {
      if (b.copy && !q.answers[pid] && q.answers[b.copy]) {
        q.answers[pid] = q.answers[b.copy];
        q.answeredAt[pid] = s.ctx.now;
      }
    }
  }
  q.result = scoreQuestion({
    question: q.question,
    targetId: q.targetId,
    participants: q.participants,
    answers: q.answers,
    boosts: q.boosts,
    multiplier: q.multiplier,
    payCoins: q.payCoins,
    // No answer at all costs coins, unless you dropped out.
    penalize: q.participants.filter((p) => isConnected(d.room, p)),
  });
  const guessers = q.participants.length - 1;
  setStage(d, "reveal", guessers * Q.revealPerAnswerMs + Q.targetRevealMs + 600);
  emit(s, { type: "questionRevealed" });
}

function enterResults(d: Draft) {
  const { g, s } = d;
  const q = g.question!;
  const r = q.result!;
  const matched = Object.entries(r.perPlayer).filter(([pid, x]) => x.match && pid !== q.targetId).map(([pid]) => pid);
  const perfect = Object.entries(r.perPlayer).filter(([pid, x]) => x.perfect && pid !== q.targetId).map(([pid]) => pid);
  for (const [pid, res] of Object.entries(r.perPlayer)) {
    const st = g.players[pid]?.stats;
    if (!st) continue;
    if (!res.isTarget && res.answer) {
      st.guesses++;
      if (res.match) st.matchesMade++;
      if (res.perfect && res.match) st.perfectMatches++;
    }
    if (res.coins) changeCoins(g, s, pid, res.coins, "question");
  }
  const tst = g.players[q.targetId]?.stats;
  if (tst) {
    tst.matchedAsTarget += r.matchedCount;
    if (r.targetSelfCorrect === true) tst.dataSelfCorrect++;
    if (r.targetSelfCorrect === false) tst.dataSelfWrong++;
  }
  emit(s, { type: "matchRevealed", playerIds: matched, perfectIds: perfect });
  emit(s, { type: "sfx", id: matched.length ? "match" : "miss" });
  setStage(d, "results", Q.resultsMs);
}

function questionDone(d: Draft) {
  const { g } = d;
  const q = g.question!;
  switch (q.context) {
    case "tile":
    case "dataTile":
    case "mindReader":
      return turnEnd(d);
    case "debug":
      return startQuestionRound(d, "debug", pickDebugTarget(d));
    case "minigameIntro": {
      g.minigame!.bonuses = bonusRecipients(q.result!, q.targetId).filter((p) => g.minigame!.participants.includes(p));
      return goto(d, "minigameCountdown", M.countdownMs);
    }
    default:
      return turnEnd(d);
  }
}

// ---------------------------------------------------------------------------
// Mini-games
// ---------------------------------------------------------------------------
function mgStepCtx(d: Draft) {
  return { now: d.s.ctx.now, rng: d.s.ctx.rng, services: questionServices(d) };
}

export function eligibleMinigames(content: ContentBundle, registry: Record<string, MiniGameDefinition>, players: number) {
  return content.minigames.filter((m) => {
    const def = registry[m.id];
    return (
      def &&
      m.enabled &&
      m.weight > 0 &&
      m.id !== "duel" &&
      def.minPlayers <= players &&
      (def.maxPlayers ?? GAME_CONFIG.players.max) >= players
    );
  });
}

/**
 * Next round mini-game. Within a cycle every enabled game comes up exactly once before any repeats;
 * the weights (content weight × mix weight) only decide which comes first, so "Many" games and the
 * voting games show up early and "Few" ones late. "Off" games never come up. When the cycle is used
 * up a new one starts (never repeating the very last game). Mutates `history.minigamesPlayed`.
 */
export function pickRoundMinigame<M extends { id: string; weight: number }>(
  eligible: M[],
  mix: Record<string, string>,
  history: { minigamesPlayed: string[] },
  rng: () => number,
): M | null {
  const MIX = GAME_CONFIG.minigameMix;
  const level = (id: string) => mix[id] ?? "normal";
  const pool = eligible.filter((m) => (MIX.weight[level(m.id)] ?? 1) > 0);
  if (!pool.length) return null;
  const count = (id: string) => history.minigamesPlayed.filter((x) => x === id).length;
  // Never the same game twice in a row while there's a choice.
  const last = history.minigamesPlayed[history.minigamesPlayed.length - 1];
  let fresh = pool.filter((m) => count(m.id) < (MIX.perCycle[level(m.id)] ?? 1) && m.id !== last);
  if (!fresh.length) {
    // Cycle used up: start a new one.
    history.minigamesPlayed = [];
    fresh = pool.length > 1 ? pool.filter((m) => m.id !== last) : pool;
  }
  const meta = weightedPick(rng, fresh, (m) => m.weight * (MIX.weight[level(m.id)] ?? 1))!;
  history.minigamesPlayed.push(meta.id);
  return meta;
}

function startRoundMinigame(d: Draft): void {
  const { g, s } = d;
  if (g.debugMinigameId) {
    const id = g.debugMinigameId;
    g.debugMinigameId = null;
    return setupMinigame(d, id, "round", [...g.order]);
  }
  const pick = pickRoundMinigame(eligibleMinigames(s.ctx.content, s.ctx.minigames, g.order.length), d.room.settings.minigameMix ?? {}, g.history, s.ctx.rng);
  if (!pick) return afterMinigameResults(d);
  setupMinigame(d, pick.id, "round", [...g.order]);
}

function setupMinigame(d: Draft, id: string, origin: "round" | "duel", participants: PlayerId[]): void {
  const { g, s } = d;
  const def = minigameDef(d, id);
  g.minigame = {
    id,
    kind: def.kind,
    origin,
    participants,
    bonuses: [],
    seed: Math.floor(s.ctx.rng() * 2 ** 31),
    startedAt: 0,
    endsAt: 0,
    state: null,
    placements: null,
    payout: null,
    introTargetId: null,
  };
  goto(d, "minigameIntro", origin === "duel" ? Math.min(M.introMs, 20000) : M.introMs);
}

function afterMinigameIntro(d: Draft) {
  const { g, s } = d;
  const mg = g.minigame!;
  if (mg.kind === "questionOnly") return goto(d, "minigameCountdown", M.countdownMs);
  const target = g.targetOverride?.targetId ?? leastTargeted(s.ctx.rng, mg.participants, g.history.targetCounts);
  mg.introTargetId = target;
  startQuestionRound(d, "minigameIntro", target);
  // Pick the Target / Spotlight may have changed who it's about.
  if (g.question) mg.introTargetId = g.question.targetId;
}

function startMinigamePlay(d: Draft) {
  const { g, s } = d;
  const mg = g.minigame!;
  const def = minigameDef(d, mg.id);
  g.question = null;
  mg.startedAt = s.ctx.now;
  mg.endsAt = s.ctx.now + def.durationSec * 1000;
  mg.state = def.init({
    players: mg.participants,
    bonuses: mg.bonuses,
    seed: mg.seed,
    rng: createRng(mg.seed ^ 0x5bd1e995),
    now: s.ctx.now,
    services: questionServices(d),
  });
  emit(s, { type: "minigameStarted", id: mg.id });
  goto(d, "minigamePlaying", def.durationSec * 1000 + M.graceMs);
}

function finishMinigame(d: Draft) {
  const { g, s } = d;
  const mg = g.minigame!;
  const def = minigameDef(d, mg.id);
  const placements = def.results(mg.state).filter((p) => g.players[p.playerId]);
  mg.placements = placements;
  let payout: Record<PlayerId, number>;
  if (def.transfers) {
    payout = Object.fromEntries(mg.participants.map((p) => [p, 0]));
    for (const t of def.transfers(mg.state, placements)) {
      const moved = transferCoins(g, s, t.from, t.to, t.amount, `minigame:${mg.id}`);
      payout[t.from] = (payout[t.from] ?? 0) - moved;
      payout[t.to] = (payout[t.to] ?? 0) + moved;
    }
  } else {
    payout = def.payout
      ? def.payout(mg.state, placements)
      : Object.fromEntries(placements.map((p) => [p.playerId, placementCoins(M.placementCoins, mg.participants.length, p.rank)]));
    for (const [pid, coins] of Object.entries(payout)) if (coins) changeCoins(g, s, pid, coins, `minigame:${mg.id}`);
  }
  mg.payout = payout;
  for (const p of placements) {
    const st = g.players[p.playerId]?.stats;
    if (!st) continue;
    st.minigamesPlayed++;
    if (p.rank === 1) st.minigameWins++;
  }
  emit(s, { type: "minigameFinished", id: mg.id });
  emit(s, { type: "sfx", id: "win" });
  goto(d, "minigameResults", M.resultsMs);
}

function startDuel(d: Draft, opponentId: PlayerId) {
  const { g } = d;
  g.duel = { challengerId: g.duel?.challengerId ?? activeId(g), opponentId };
  setupMinigame(d, "duel", "duel", [g.duel.challengerId, opponentId]);
}

function afterMinigameResults(d: Draft): void {
  const { g } = d;
  const origin = g.minigame?.origin;
  g.minigame = null;
  if (origin === "duel") return turnEnd(d);
  if (g.mode === "minigameDebug") return startRoundMinigame(d);
  g.round++;
  g.tolls = (g.tolls ?? []).filter((t) => t.untilRound >= g.round);
  if (g.starSurge && g.starSurge.round < g.round) g.starSurge = null;
  if (g.turnCount > 0 && g.round > g.turnCount) {
    g.round = g.turnCount;
    return goto(d, "gameEnd", T.gameEndMs);
  }
  g.activeIndex = 0;
  turnStart(d);
}

// ---------------------------------------------------------------------------
// Game end
// ---------------------------------------------------------------------------
/** Who leads a bonus-star / highlight category (ties share it). Empty when nobody qualifies. */
export function evaluateBonusStar(
  g: Pick<GameState, "players">,
  b: ContentBundle["bonusStars"][number],
): BonusStarAward {
  const eligible = Object.values(g.players).filter(
    (p) => (!b.requiresTargetAtLeastOnce || p.stats.timesTarget > 0) && (!b.per || p.stats[b.per] >= (b.minPer ?? 1)),
  );
  if (!eligible.length) return { bonusStarId: b.id, playerIds: [], value: 0 };
  // Rates are compared rounded, so 2/3 and 4/6 tie.
  const valueOf = (p: (typeof eligible)[number]) =>
    b.per ? Math.round((p.stats[b.stat] / p.stats[b.per]) * 1000) / 1000 : p.stats[b.stat];
  const vals = eligible.map(valueOf);
  const best = b.mode === "max" ? Math.max(...vals) : Math.min(...vals);
  // A "max" award for 0 is meaningless; nobody gets it.
  if (b.mode === "max" && best === 0) return { bonusStarId: b.id, playerIds: [], value: 0 };
  return { bonusStarId: b.id, playerIds: eligible.filter((p) => valueOf(p) === best).map((p) => p.id), value: best };
}

/** How many bonus stars a game hands out: more players, more stars (2 players → 2, 8 players → 5). */
export function bonusStarCount(players: number): number {
  const { base, playersPerStar } = GAME_CONFIG.bonusStars;
  return base + Math.ceil(players / playersPerStar);
}

/**
 * End-of-game bonus stars: drawn at random from the highlight categories (bonusStars.json),
 * only among categories somebody actually won. The count depends on the number of players.
 */
export function computeBonusStars(g: GameState, content: ContentBundle, rng: () => number): BonusStarAward[] {
  const count = bonusStarCount(Object.keys(g.players).length);
  const won = shuffle(rng, content.bonusStars)
    .map((b) => evaluateBonusStar(g, b))
    .filter((a) => a.playerIds.length > 0);
  return won.slice(0, count);
}

function startBonusStars(d: Draft) {
  const { g, s } = d;
  // A star race was won outright: no bonus stars that could change the result.
  if (g.starGoalWinner) return finishGame(d);
  const awards = computeBonusStars(g, s.ctx.content, s.ctx.rng);
  // Nobody won any category (e.g. a game ended right away): nothing to reveal.
  if (!awards.length) return finishGame(d);
  g.bonusStars = { awards, revealed: 0 };
  goto(d, "bonusStars", 1500);
}

function revealNextBonusStar(d: Draft) {
  const { g, s } = d;
  const bs = g.bonusStars!;
  if (bs.revealed >= bs.awards.length) return finishGame(d);
  const award = bs.awards[bs.revealed];
  bs.revealed++;
  for (const pid of award.playerIds) changeStars(g, s, pid, 1, `bonus:${award.bonusStarId}`);
  emit(s, { type: "bonusStarRevealed", bonusStarId: award.bonusStarId, playerIds: award.playerIds });
  emit(s, { type: "sfx", id: "star" });
  goto(d, "bonusStars", bs.revealed >= bs.awards.length ? T.bonusStarsHoldMs : T.bonusStarRevealMs);
}

function finishGame(d: Draft) {
  const { g, s } = d;
  g.finalRanking = standings(g).map((x) => x.playerId);
  emit(s, { type: "sfx", id: "fanfare" });
  goto(d, "podium", null);
}

export { standings };
