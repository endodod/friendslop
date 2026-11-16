import { z } from "zod";
import {
  AnswerSchema,
  GAME_CONFIG,
  getFormat,
  withinTolerance,
  type MiniGameDefinition,
  type PlayerId,
  type PublicQuestionRound,
} from "@party-game/shared";
import { answerMiniRound, createMiniRound, miniRoundDone, publicMiniRound, stepMiniRound, type MiniRound } from "../kit/miniRound";

export interface DuelState {
  duelists: [PlayerId, PlayerId];
  round: MiniRound | null;
  winner: PlayerId | null;
  loser: PlayerId | null;
  reason: string;
  done: boolean;
}

export interface DuelPublic {
  duelists: [PlayerId, PlayerId];
  round: PublicQuestionRound | null;
  winner: PlayerId | null;
  loser: PlayerId | null;
  reason: string;
}

function decide(s: DuelState, names: Record<PlayerId, string>): DuelState {
  const r = s.round!;
  const [c, o] = s.duelists;
  const q = r.question;
  const truth = q.isData ? q.truth : r.answers[r.targetId];
  const num = (pid: PlayerId) => {
    const a = r.answers[pid];
    return a && a.kind === "number" ? a.value : null;
  };
  if (!truth || truth.kind !== "number") return { ...s, reason: `${names[r.targetId]} didn't answer. No steal!` };
  const t = truth.value;
  // 2-player duel about the opponent (non-data): challenger guesses, opponent is the truth.
  if (!q.isData && r.targetId === o) {
    const g = num(c);
    const hit = g !== null && q.number && withinTolerance(g, t, q.number.tolerance, q.number.step);
    return hit
      ? { ...s, winner: c, loser: o, reason: `${names[c]} read ${names[o]} perfectly!` }
      : { ...s, winner: o, loser: c, reason: `${names[c]} misjudged ${names[o]}!` };
  }
  const dc = num(c) === null ? Infinity : Math.abs(num(c)! - t);
  const dO = num(o) === null ? Infinity : Math.abs(num(o)! - t);
  if (dc === dO) return { ...s, reason: "Dead heat! Nobody steals." };
  const [w, l] = dc < dO ? [c, o] : [o, c];
  return { ...s, winner: w, loser: l, reason: `${names[w]} was closer!` };
}

export const duel: MiniGameDefinition<DuelState, { answer: unknown }> = {
  id: "duel",
  kind: "questionOnly",
  durationSec: 75,
  minPlayers: 2,
  inputSchema: z.object({ answer: AnswerSchema }) as never,
  init: ({ players, services, now, rng }) => {
    const duelists = [players[0], players[1]] as [PlayerId, PlayerId];
    const others = services.allPlayers.filter((p) => !duelists.includes(p));
    const target = others.length ? services.leastTargeted(others) : duelists[1];
    const question = services.pickQuestion({
      targetId: target,
      usage: "questionOnlyMinigame",
      formats: ["number", "scale"],
      allowData: true,
      participants: services.allPlayers,
    });
    if (!question) return { duelists, round: null, winner: null, loser: null, reason: "No question available.", done: true };
    services.noteTargeted(target);
    const guessers = question.isData ? [...duelists] : target === duelists[1] ? [duelists[0]] : [...duelists];
    const participants = question.isData || target === duelists[1] ? [...new Set([...guessers, target])] : [target, ...guessers];
    return {
      duelists,
      round: createMiniRound({
        uid: `duel-${now}`,
        question,
        targetId: target,
        participants,
        now,
        rng,
        answerMs: GAME_CONFIG.duel.answerMs,
      }),
      winner: null,
      loser: null,
      reason: "",
      done: false,
    };
  },
  extraInputPlayers: (s) => (s.round ? s.round.participants.filter((p) => !s.duelists.includes(p)) : []),
  onInput: (s, pid, input, { now, services }) => {
    if (!s.round) return s;
    const a = (input as { answer: never }).answer;
    return { ...s, round: answerMiniRound(s.round, pid, a, now, services) };
  },
  tick: (s, { now, services }) => {
    if (!s.round || s.done) return s;
    const before = s.round.stage;
    const round = stepMiniRound(s.round, now, (r) => services.scoreAnswers(r.question, r.targetId, r.participants, r.answers), { resultsMs: 4500 });
    let next: DuelState = { ...s, round };
    if (before === "answering" && round.stage === "reveal") next = decide(next, services.names);
    if (miniRoundDone(round, now)) next = { ...next, done: true };
    return next;
  },
  isFinished: (s) => s.done,
  onTimeout: (s) => ({ ...s, done: true }),
  results: (s) =>
    s.winner && s.loser
      ? [
          { playerId: s.winner, rank: 1, label: "Winner" },
          { playerId: s.loser, rank: 2, label: "Loser" },
        ]
      : s.duelists.map((p) => ({ playerId: p, rank: 1, label: "Draw" })),
  transfers: (s) => (s.winner && s.loser ? [{ from: s.loser, to: s.winner, amount: GAME_CONFIG.duel.stealCoins }] : []),
  publicState: (s): DuelPublic => ({
    duelists: s.duelists,
    round: s.round ? publicMiniRound(s.round) : null,
    winner: s.round && (s.round.stage === "reveal" || s.round.stage === "results") ? s.winner : null,
    loser: s.round && (s.round.stage === "reveal" || s.round.stage === "results") ? s.loser : null,
    reason: s.round && s.round.stage === "results" ? s.reason : "",
  }),
  privateState: (s, pid) => ({ myAnswer: s.round?.answers[pid] ?? null }),
};

void getFormat;
