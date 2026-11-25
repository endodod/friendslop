import { countAnswers } from "../formats";
import type { MinigameRegistry } from "../minigame/types";
import { toPrivateHub, toPublicHub, type PublicHub } from "../hub/engine";
import type {
  Answer,
  GameState,
  MinigameRuntime,
  PlayerId,
  QuestionResult,
  QuestionRound,
  ResolvedQuestion,
  RoomState,
} from "./types";

/**
 * What everyone may see. Secrets (answers before reveal, data-question truth,
 * hidden mini-game state) are stripped here. Items are public: everyone can see what others hold. This is the only path state takes to clients.
 */
export type PublicQuestionRound = Omit<QuestionRound, "answers" | "answeredAt" | "boosts" | "result" | "question"> & {
  question: Omit<ResolvedQuestion, "truth">;
  answered: PlayerId[];
  /** Only present from the reveal stage on. */
  answers: Record<PlayerId, Answer> | null;
  result: QuestionResult | null;
  /** Who used items this round (visible flair), not what they saw. */
  boosted: PlayerId[];
};

export type PublicMinigame = Omit<MinigameRuntime, "state" | "seed"> & {
  state: unknown;
  /** Everyone who may send input: participants plus extra players (e.g. the duel's target). */
  inputPlayers: PlayerId[];
};

export type PublicGamePlayer = GameState["players"][string] & { itemCount: number };

export type PublicGameState = Omit<GameState, "question" | "minigame" | "players" | "history" | "starNext" | "starRadar"> & {
  question: PublicQuestionRound | null;
  minigame: PublicMinigame | null;
  players: Record<PlayerId, PublicGamePlayer>;
  history: { targetCounts: Record<PlayerId, number>; minigamesPlayed: string[] };
};

export type PublicRoomState = Omit<RoomState, "game" | "hub" | "askedQuestionIds" | "lastClueGivers"> & {
  game: PublicGameState | null;
  hub: PublicHub | null;
  serverNow: number;
};

export interface PrivateState {
  playerId: PlayerId | null;
  items: string[];
  /** Own answer in the current question round. */
  myAnswer: Answer | null;
  boosts: { peek?: boolean; wide?: boolean; double?: boolean; copy?: PlayerId };
  /** Star Radar: where the star goes next (only for players who used one). */
  starNext: string | null;
  /** Peek item: answer counts so far, excluding the target's pick. */
  peekCounts: Record<string, number> | null;
  minigame: unknown;
  /** Solo mini-games: the shared seed for the local layout. */
  minigameSeed: number | null;
  /** Hub games: this player's secrets (e.g. the Spy Grid key for clue-givers). */
  hub: unknown;
}

function publicQuestion(q: QuestionRound): PublicQuestionRound {
  const revealed = q.stage === "reveal" || q.stage === "results";
  const { truth: _truth, ...question } = q.question;
  return {
    uid: q.uid,
    context: q.context,
    targetId: q.targetId,
    participants: q.participants,
    stage: q.stage,
    stageStartedAt: q.stageStartedAt,
    stageEndsAt: q.stageEndsAt,
    revealOrder: q.revealOrder,
    multiplier: q.multiplier,
    payCoins: q.payCoins,
    question: revealed ? { ...question, ...(q.question.truth ? { truth: q.question.truth } : {}) } : question,
    // Copycats count as locked in.
    answered: [...new Set([...Object.keys(q.answers), ...Object.entries(q.boosts).filter(([, b]) => b.copy).map(([p]) => p)])],
    answers: revealed ? q.answers : null,
    result: revealed ? q.result : null,
    boosted: Object.keys(q.boosts),
  };
}

export function toPublicState(room: RoomState, registry: MinigameRegistry, now: number): PublicRoomState {
  const { game, hub, askedQuestionIds: _asked, lastClueGivers: _lcg, ...rest } = room;
  if (!game) return { ...rest, game: null, hub: hub ? toPublicHub(hub, now) : null, serverNow: now };
  const { question, minigame, players, history, starNext: _next, starRadar: _radar, ...g } = game;
  let mg: PublicMinigame | null = null;
  if (minigame) {
    const { state, seed: _seed, ...m } = minigame;
    const def = registry[minigame.id];
    const extra = state != null && def?.extraInputPlayers ? def.extraInputPlayers(state) : [];
    mg = { ...m, state: state != null && def ? def.publicState(state, now) : null, inputPlayers: [...m.participants, ...extra] };
  }
  return {
    ...rest,
    serverNow: now,
    hub: null,
    game: {
      ...g,
      question: question ? publicQuestion(question) : null,
      minigame: mg,
      players: Object.fromEntries(
        Object.entries(players).map(([id, p]) => [id, { ...p, items: [...p.items], itemCount: p.items.length }]),
      ),
      history: { targetCounts: history.targetCounts, minigamesPlayed: history.minigamesPlayed },
    },
  };
}

export function toPrivateState(
  room: RoomState,
  playerId: PlayerId | null,
  registry: MinigameRegistry,
  now: number,
): PrivateState {
  const g = room.game;
  const out: PrivateState = {
    playerId,
    items: [],
    myAnswer: null,
    boosts: {},
    peekCounts: null,
    minigame: null,
    minigameSeed: null,
    starNext: null,
    hub: null,
  };
  if (room.hub) out.hub = toPrivateHub(room.hub, playerId, now);
  if (!g || !playerId) return out;
  out.items = [...(g.players[playerId]?.items ?? [])];
  if (g.starNext && g.starRadar?.includes(playerId)) out.starNext = g.starNext;
  const q = g.question;
  if (q) {
    out.myAnswer = q.answers[playerId] ?? null;
    out.boosts = q.boosts[playerId] ?? {};
    if (out.boosts.peek && q.stage === "answering") {
      // never the target's pick, never who picked what
      out.peekCounts = countAnswers(q.answers, [q.targetId, playerId]);
    }
  }
  const mg = g.minigame;
  const mgDef = mg ? registry[mg.id] : undefined;
  const mgPlayers = mg ? [...mg.participants, ...(mgDef?.extraInputPlayers && mg.state != null ? mgDef.extraInputPlayers(mg.state) : [])] : [];
  if (mg && mgPlayers.includes(playerId) && g.phase === "minigamePlaying") {
    const def = mgDef;
    out.minigameSeed = mg.seed;
    if (def?.privateState && mg.state != null) out.minigame = def.privateState(mg.state, playerId, now);
  }
  return out;
}
