import { z } from "zod";
import { AnswerSchema, rankByScore, type MiniGameDefinition, type PlayerId, type ResolvedQuestion } from "@party-game/shared";

export const ROUNDS = 4;
export const VOTE_MS = 11000;
export const REVEAL_MS = 4500;

interface Round {
  question: ResolvedQuestion;
  stage: "vote" | "reveal";
  stageEndsAt: number;
  votes: Record<PlayerId, PlayerId>;
  majority: PlayerId[];
}
export interface MltState {
  players: PlayerId[];
  index: number;
  round: Round | null;
  points: Record<PlayerId, number>;
  done: boolean;
}
export interface MltPublic {
  index: number;
  total: number;
  round: { question: ResolvedQuestion; stage: Round["stage"]; stageEndsAt: number; voted: PlayerId[]; votes: Record<PlayerId, PlayerId> | null; majority: PlayerId[] } | null;
  points: Record<PlayerId, number>;
}

/** The most-voted player(s). With no repeated vote at all (everyone picked someone else), there's no majority. */
export function majorityOf(votes: Record<PlayerId, PlayerId>): PlayerId[] {
  const counts: Record<PlayerId, number> = {};
  for (const v of Object.values(votes)) counts[v] = (counts[v] ?? 0) + 1;
  const max = Math.max(0, ...Object.values(counts));
  const voters = Object.keys(votes).length;
  if (max === 0 || (max === 1 && voters > 1)) return [];
  return Object.keys(counts).filter((k) => counts[k] === max);
}

function next(s: MltState, now: number, services: { pickQuestion: (o: never) => ResolvedQuestion | null }, idx: number): MltState {
  if (idx >= ROUNDS) return { ...s, index: idx, round: null, done: true };
  const question = services.pickQuestion({ targetId: s.players[0], usage: "questionOnlyMinigame", formats: ["player"], tags: ["mostLikely"] } as never);
  if (!question) return { ...s, index: idx, round: null, done: true };
  return { ...s, index: idx, round: { question, stage: "vote", stageEndsAt: now + VOTE_MS, votes: {}, majority: [] } };
}

export const mostLikelyTo: MiniGameDefinition<MltState, { answer: unknown }> = {
  id: "most-likely-to",
  kind: "questionOnly",
  durationSec: 80,
  minPlayers: 2,
  inputSchema: z.object({ answer: AnswerSchema }) as never,
  init: ({ players, services, now }) =>
    next({ players, index: 0, round: null, points: Object.fromEntries(players.map((p) => [p, 0])), done: false }, now, services as never, 0),
  onInput: (s, pid, input) => {
    const r = s.round;
    const a = (input as { answer: { kind: string; playerId?: string } }).answer;
    if (!r || r.stage !== "vote" || r.votes[pid] || a.kind !== "player" || !a.playerId || !s.players.includes(a.playerId)) return s;
    return { ...s, round: { ...r, votes: { ...r.votes, [pid]: a.playerId } } };
  },
  tick: (s, { now, services }) => {
    const r = s.round;
    if (!r || s.done) return s;
    if (r.stage === "vote" && (now >= r.stageEndsAt || s.players.every((p) => r.votes[p]))) {
      const majority = majorityOf(r.votes);
      const points = { ...s.points };
      for (const [voter, choice] of Object.entries(r.votes)) if (majority.includes(choice)) points[voter] += 1;
      return { ...s, points, round: { ...r, stage: "reveal", stageEndsAt: now + REVEAL_MS, majority } };
    }
    if (r.stage === "reveal" && now >= r.stageEndsAt) return next(s, now, services as never, s.index + 1);
    return s;
  },
  isFinished: (s) => s.done,
  onTimeout: (s) => ({ ...s, done: true }),
  results: (s) => rankByScore(s.players, s.points, true, (n) => `${n} pts`),
  publicState: (s): MltPublic => ({
    index: s.index,
    total: ROUNDS,
    points: s.points,
    round: s.round
      ? {
          question: s.round.question,
          stage: s.round.stage,
          stageEndsAt: s.round.stageEndsAt,
          voted: Object.keys(s.round.votes),
          votes: s.round.stage === "reveal" ? s.round.votes : null,
          majority: s.round.majority,
        }
      : null,
  }),
  privateState: (s, pid) => ({ myVote: s.round?.votes[pid] ?? null }),
};
