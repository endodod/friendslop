import { z } from "zod";
import {
  AnswerSchema,
  rankByScore,
  type Answer,
  type MiniGameDefinition,
  type MinigameServices,
  type PlayerId,
  type ResolvedQuestion,
} from "@party-game/shared";

export const TARGET_MS = 14000;
export const GUESS_MS = 9000;
export const REVEAL_MS = 4000;
export const INTRO_MS = 2000;

interface Round {
  targetId: PlayerId;
  question: ResolvedQuestion;
  stage: "intro" | "target" | "guess" | "reveal";
  stageEndsAt: number;
  /** Secret until reveal: the target's (or real) number. */
  truth: number | null;
  reference: number | null;
  guesses: Record<PlayerId, "higher" | "lower">;
}

export interface HotOrNotState {
  players: PlayerId[];
  targets: PlayerId[];
  index: number;
  round: Round | null;
  points: Record<PlayerId, number>;
  done: boolean;
}

export interface HotOrNotPublic {
  index: number;
  total: number;
  round: {
    targetId: PlayerId;
    question: Omit<ResolvedQuestion, "truth">;
    stage: Round["stage"];
    stageEndsAt: number;
    reference: number | null;
    guessed: PlayerId[];
    truth: number | null;
    guesses: Record<PlayerId, "higher" | "lower"> | null;
  } | null;
  points: Record<PlayerId, number>;
}

function makeReference(truth: number, q: ResolvedQuestion, rng: () => number): number {
  const { min, max, step } = q.number!;
  const span = max - min;
  const off = Math.max(step, Math.round(((0.12 + rng() * 0.3) * span) / step) * step);
  let ref = rng() < 0.5 ? truth + off : truth - off;
  if (ref > max || ref < min) ref = truth + (ref > max ? -off : off);
  ref = Math.min(max, Math.max(min, ref));
  if (ref === truth) ref = truth + (truth + step <= max ? step : -step);
  return +ref.toFixed(4);
}

function startRound(s: HotOrNotState, now: number, services: MinigameServices): HotOrNotState {
  if (s.index >= s.targets.length) return { ...s, round: null, done: true };
  const targetId = s.targets[s.index];
  const question = services.pickQuestion({ targetId, usage: "questionOnlyMinigame", formats: ["number", "scale"], allowData: true });
  if (!question || !question.number) return { ...s, index: s.index + 1, round: null, done: s.index + 1 >= s.targets.length };
  services.noteTargeted(targetId);
  return {
    ...s,
    round: {
      targetId,
      question,
      stage: "intro",
      stageEndsAt: now + INTRO_MS,
      truth: question.isData && question.truth?.kind === "number" ? question.truth.value : null,
      reference: null,
      guesses: {},
    },
  };
}

export const hotOrNot: MiniGameDefinition<HotOrNotState, { answer: Answer } | { dir: "higher" | "lower" }> = {
  id: "hot-or-not",
  kind: "questionOnly",
  durationSec: 140,
  minPlayers: 2,
  inputSchema: z.union([z.object({ answer: AnswerSchema }), z.object({ dir: z.enum(["higher", "lower"]) })]) as never,
  init: ({ players, services, now, rng }) => {
    const targets = [...players].sort(() => rng() - 0.5).slice(0, Math.min(players.length, 4));
    const s: HotOrNotState = { players, targets, index: 0, round: null, points: Object.fromEntries(players.map((p) => [p, 0])), done: false };
    return startRound(s, now, services);
  },
  onInput: (s, pid, input, { services, rng, now }) => {
    const r = s.round;
    if (!r) return s;
    if ("answer" in input && r.stage === "target" && pid === r.targetId && !r.question.isData) {
      const a = input.answer;
      if (a.kind !== "number" || !services.validateAnswer(r.question, a)) return s;
      return { ...s, round: { ...r, truth: a.value, stage: "guess", reference: makeReference(a.value, r.question, rng), stageEndsAt: now + GUESS_MS } };
    }
    if ("dir" in input && r.stage === "guess" && !r.guesses[pid] && (pid !== r.targetId || r.question.isData)) {
      return { ...s, round: { ...r, guesses: { ...r.guesses, [pid]: input.dir } } };
    }
    return s;
  },
  tick: (s, ctx) => {
    const { now, rng } = ctx;
    const r = s.round;
    if (!r || s.done) return s;
    const guessers = s.players.filter((p) => p !== r.targetId || r.question.isData);
    if (r.stage === "intro" && now >= r.stageEndsAt) {
      if (r.question.isData && r.truth !== null)
        return { ...s, round: { ...r, stage: "guess", reference: makeReference(r.truth, r.question, rng), stageEndsAt: now + GUESS_MS } };
      return { ...s, round: { ...r, stage: "target", stageEndsAt: now + TARGET_MS } };
    }
    if (r.stage === "target" && now >= r.stageEndsAt) {
      // Target didn't answer: skip the round.
      return startRound({ ...s, index: s.index + 1 }, now, ctx.services);
    }
    if (r.stage === "guess" && (now >= r.stageEndsAt || guessers.every((p) => r.guesses[p]))) {
      const correct: "higher" | "lower" = r.truth! > r.reference! ? "higher" : "lower";
      const points = { ...s.points };
      for (const p of guessers) if (r.guesses[p] === correct) points[p] += 1;
      return { ...s, points, round: { ...r, stage: "reveal", stageEndsAt: now + REVEAL_MS } };
    }
    if (r.stage === "reveal" && now >= r.stageEndsAt) return startRound({ ...s, index: s.index + 1 }, now, ctx.services);
    return s;
  },
  isFinished: (s) => s.done,
  onTimeout: (s) => ({ ...s, done: true }),
  results: (s) => rankByScore(s.players, s.points, true, (n) => `${n} pts`),
  publicState: (s): HotOrNotPublic => {
    const r = s.round;
    const revealed = r?.stage === "reveal";
    return {
      index: s.index,
      total: s.targets.length,
      points: s.points,
      round: r
        ? {
            targetId: r.targetId,
            question: (({ truth: _t, ...q }) => q)(r.question),
            stage: r.stage,
            stageEndsAt: r.stageEndsAt,
            reference: r.reference,
            guessed: Object.keys(r.guesses),
            truth: revealed ? r.truth : null,
            guesses: revealed ? r.guesses : null,
          }
        : null,
    };
  },
  privateState: (s, pid) => ({ myGuess: s.round?.guesses[pid] ?? null, myTruth: s.round && pid === s.round.targetId && !s.round.question.isData ? s.round.truth : null }),
};
