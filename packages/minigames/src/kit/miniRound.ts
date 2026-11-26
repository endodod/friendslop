import {
  GAME_CONFIG,
  type Answer,
  type MinigameServices,
  type PlayerId,
  type PublicQuestionRound,
  type QuestionResult,
  type ResolvedQuestion,
} from "@party-game/shared";

const Q = GAME_CONFIG.question;

/**
 * A question round living inside a mini-game's state. Same stages and timings as board
 * rounds, so the shared QuestionRound UI renders it unchanged.
 */
export interface MiniRound {
  uid: string;
  question: ResolvedQuestion;
  targetId: PlayerId;
  participants: PlayerId[];
  stage: "intro" | "answering" | "reveal" | "results";
  stageStartedAt: number;
  stageEndsAt: number;
  answers: Record<PlayerId, Answer>;
  answeredAt: Record<PlayerId, number>;
  result: QuestionResult | null;
  revealOrder: PlayerId[];
  /** null = no time limit: answering ends when everyone present has answered (stageEndsAt is then 0). */
  answerMs: number | null;
  /** When the answering stage opened (for speed bonuses). */
  answeringStartedAt: number | null;
}

export function createMiniRound(args: {
  uid: string;
  question: ResolvedQuestion;
  targetId: PlayerId;
  participants: PlayerId[];
  now: number;
  /** null = no time limit. */
  answerMs?: number | null;
  introMs?: number;
  rng: () => number;
}): MiniRound {
  const guessers = args.participants.filter((p) => p !== args.targetId);
  // shuffle reveal order of guessers
  for (let i = guessers.length - 1; i > 0; i--) {
    const j = Math.floor(args.rng() * (i + 1));
    [guessers[i], guessers[j]] = [guessers[j], guessers[i]];
  }
  const introMs = args.introMs ?? 2200;
  return {
    uid: args.uid,
    question: args.question,
    targetId: args.targetId,
    participants: args.participants,
    stage: "intro",
    stageStartedAt: args.now,
    stageEndsAt: args.now + introMs,
    answers: {},
    answeredAt: {},
    result: null,
    revealOrder: args.participants.includes(args.targetId) ? [...guessers, args.targetId] : guessers,
    answerMs: args.answerMs === null ? null : (args.answerMs ?? Q.answerMs),
    answeringStartedAt: null,
  };
}

export function revealDurationMs(r: MiniRound): number {
  const guessers = r.participants.filter((p) => p !== r.targetId).length;
  return guessers * Q.revealPerAnswerMs + Q.targetRevealMs + 600;
}

/** Record an answer. Returns the updated round (or the same one if rejected). */
export function answerMiniRound(r: MiniRound, pid: PlayerId, a: Answer, now: number, services: MinigameServices): MiniRound {
  if (r.stage !== "answering" || !r.participants.includes(pid) || r.answers[pid]) return r;
  if (!services.validateAnswer(r.question, a)) return r;
  return { ...r, answers: { ...r.answers, [pid]: a }, answeredAt: { ...r.answeredAt, [pid]: now } };
}

/**
 * Advance stage on timeout or when everyone answered. `score` computes the result at reveal.
 * `present`: who still counts (untimed rounds don't wait for players who left).
 */
export function stepMiniRound(
  r: MiniRound,
  now: number,
  score: (r: MiniRound) => QuestionResult,
  opts: { resultsMs?: number; revealMs?: number; present?: (pid: PlayerId) => boolean } = {},
): MiniRound {
  const allIn = r.participants.every((p) => r.answers[p] || (opts.present ? !opts.present(p) : false));
  const timeUp = r.stageEndsAt > 0 && now >= r.stageEndsAt;
  if (r.stage === "intro" && now >= r.stageEndsAt)
    return { ...r, stage: "answering", stageStartedAt: now, stageEndsAt: r.answerMs === null ? 0 : now + r.answerMs, answeringStartedAt: now };
  if (r.stage === "answering" && (timeUp || allIn)) {
    const next = { ...r, stage: "reveal" as const, stageStartedAt: now, result: score(r) };
    return { ...next, stageEndsAt: now + (opts.revealMs ?? revealDurationMs(next)) };
  }
  if (r.stage === "reveal" && now >= r.stageEndsAt)
    return { ...r, stage: "results", stageStartedAt: now, stageEndsAt: now + (opts.resultsMs ?? 3500) };
  return r;
}

export function miniRoundDone(r: MiniRound, now: number) {
  return r.stage === "results" && now >= r.stageEndsAt;
}

/** Public projection in the exact shape of a board question round. */
export function publicMiniRound(r: MiniRound): PublicQuestionRound {
  const revealed = r.stage === "reveal" || r.stage === "results";
  const { truth, ...question } = r.question;
  return {
    uid: r.uid,
    context: "minigame",
    targetId: r.targetId,
    participants: r.participants,
    stage: r.stage,
    stageStartedAt: r.stageStartedAt,
    stageEndsAt: r.stageEndsAt,
    revealOrder: r.revealOrder,
    multiplier: 1,
    payCoins: false,
    question: revealed && truth ? { ...question, truth } as never : question,
    answered: Object.keys(r.answers),
    answers: revealed ? r.answers : null,
    result: revealed ? r.result : null,
    boosted: [],
  };
}
