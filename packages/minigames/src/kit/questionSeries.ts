import { z } from "zod";
import { AnswerSchema, rankByScore, type MiniGameDefinition, type MinigameServices, type PlayerId, type PublicQuestionRound } from "@party-game/shared";
import { answerMiniRound, createMiniRound, miniRoundDone, publicMiniRound, stepMiniRound, type MiniRound } from "./miniRound";

export interface SeriesState {
  players: PlayerId[];
  rounds: number;
  index: number;
  round: MiniRound | null;
  points: Record<PlayerId, number>;
  lastGain: Record<PlayerId, number>;
  done: boolean;
}

export interface SeriesPublic {
  index: number;
  total: number;
  round: PublicQuestionRound | null;
  points: Record<PlayerId, number>;
  lastGain: Record<PlayerId, number>;
  answerMs: number | null;
}

/**
 * A mini-game made of several question rounds about rotating targets. `points` turns a scored
 * round into per-player points.
 */
export function defineQuestionSeries(opts: {
  id: string;
  rounds: (players: number) => number;
  formats: string[];
  tags?: string[];
  allowData?: boolean;
  /** null = no time limit (wait for everyone present). */
  answerMs: number | null;
  introMs?: number;
  resultsMs?: number;
  durationSec: number;
  points: (round: MiniRound, services: MinigameServices) => Record<PlayerId, number>;
}): MiniGameDefinition<SeriesState, { answer: unknown }> {
  const start = (s: SeriesState, now: number, rng: () => number, services: MinigameServices): SeriesState => {
    if (s.index >= s.rounds) return { ...s, round: null, done: true };
    const target = services.leastTargeted(s.players);
    const question = services.pickQuestion({ targetId: target, usage: "questionOnlyMinigame", formats: opts.formats, tags: opts.tags, allowData: opts.allowData });
    if (!question) return { ...s, round: null, done: true };
    services.noteTargeted(target);
    return {
      ...s,
      round: createMiniRound({ uid: `${opts.id}-${s.index}-${now}`, question, targetId: target, participants: s.players, now, rng, answerMs: opts.answerMs, introMs: opts.introMs ?? 1800 }),
    };
  };
  return {
    id: opts.id,
    kind: "questionOnly",
    durationSec: opts.durationSec,
    untimed: opts.answerMs === null,
    minPlayers: 2,
    inputSchema: z.object({ answer: AnswerSchema }) as never,
    init: ({ players, services, now, rng }) =>
      start({ players, rounds: opts.rounds(players.length), index: 0, round: null, points: Object.fromEntries(players.map((p) => [p, 0])), lastGain: {}, done: false }, now, rng, services),
    onInput: (s, pid, input, { now, services }) =>
      s.round ? { ...s, round: answerMiniRound(s.round, pid, (input as { answer: never }).answer, now, services) } : s,
    tick: (s, { now, rng, services }) => {
      if (!s.round || s.done) return s;
      const before = s.round.stage;
      const round = stepMiniRound(s.round, now, (r) => services.scoreAnswers(r.question, r.targetId, r.participants, r.answers), { resultsMs: opts.resultsMs ?? 2500, present: services.isPresent });
      let next: SeriesState = { ...s, round };
      if (before === "answering" && round.stage === "reveal") {
        const gain = opts.points(round, services);
        const points = { ...s.points };
        for (const [p, g] of Object.entries(gain)) points[p] = (points[p] ?? 0) + g;
        next = { ...next, points, lastGain: gain };
      }
      if (miniRoundDone(round, now)) next = start({ ...next, index: s.index + 1 }, now, rng, services);
      return next;
    },
    isFinished: (s) => s.done,
    onTimeout: (s) => ({ ...s, done: true }),
    results: (s) => rankByScore(s.players, s.points, true, (n) => `${n} pts`),
    publicState: (s): SeriesPublic => ({
      index: s.index,
      total: s.rounds,
      round: s.round ? publicMiniRound(s.round) : null,
      points: s.points,
      lastGain: s.round && s.round.stage !== "intro" && s.round.stage !== "answering" ? s.lastGain : {},
      answerMs: opts.answerMs,
    }),
    privateState: (s, pid) => ({ myAnswer: s.round?.answers[pid] ?? null }),
  };
}
