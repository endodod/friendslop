import { z } from "zod";
import { AnswerSchema, rankByScore, type MiniGameDefinition, type PlayerId, type ResolvedQuestion } from "@party-game/shared";

/**
 * Voting mini-games: a "Who's most likely to…?" prompt, everyone votes for a player, then the
 * round is scored. The variants differ only in who may be picked and how votes turn into points.
 */
export const VOTE_ROUNDS = 4;
/** Kept for clients that show how long a vote usually takes; votes have no time limit. */
export const VOTE_MS = 11000;
export const VOTE_REVEAL_MS = 4500;

export interface VoteRound {
  question: ResolvedQuestion;
  stage: "vote" | "reveal";
  /** 0 while voting: no time limit. */
  stageEndsAt: number;
  votes: Record<PlayerId, PlayerId>;
  /** Highlighted in the reveal (the majority, the judge's pick…). */
  winners: PlayerId[];
  /** Points each player got this round. */
  gained: Record<PlayerId, number>;
  /** Judge's Call: whose pick counts this round. */
  judge: PlayerId | null;
}
export interface VoteState {
  players: PlayerId[];
  index: number;
  round: VoteRound | null;
  points: Record<PlayerId, number>;
  done: boolean;
}
export interface VotePublic {
  index: number;
  total: number;
  /** Players can't vote for themselves (Hall of Fame). */
  noSelfVote: boolean;
  round: {
    question: ResolvedQuestion;
    stage: VoteRound["stage"];
    stageEndsAt: number;
    voted: PlayerId[];
    votes: Record<PlayerId, PlayerId> | null;
    winners: PlayerId[];
    gained: Record<PlayerId, number> | null;
    judge: PlayerId | null;
  } | null;
  points: Record<PlayerId, number>;
}

export function voteCounts(votes: Record<PlayerId, PlayerId>): Record<PlayerId, number> {
  const counts: Record<PlayerId, number> = {};
  for (const v of Object.values(votes)) counts[v] = (counts[v] ?? 0) + 1;
  return counts;
}

/** The most-voted player(s). With no repeated vote at all (everyone picked someone else), there's no majority. */
export function majorityOf(votes: Record<PlayerId, PlayerId>): PlayerId[] {
  const counts = voteCounts(votes);
  const max = Math.max(0, ...Object.values(counts));
  const voters = Object.keys(votes).length;
  if (max === 0 || (max === 1 && voters > 1)) return [];
  return Object.keys(counts).filter((k) => counts[k] === max);
}

export interface VoteGameOptions {
  id: string;
  durationSec?: number;
  /** May players vote for themselves? */
  selfVote: boolean;
  /** A different player is the judge each round. */
  judge?: boolean;
  /** Turn a round's votes into points (and who to highlight). */
  score(votes: Record<PlayerId, PlayerId>, players: PlayerId[], judge: PlayerId | null): { winners: PlayerId[]; gained: Record<PlayerId, number> };
}

export function defineVoteGame(opts: VoteGameOptions): MiniGameDefinition<VoteState, { answer: unknown }> {
  const next = (s: VoteState, now: number, services: { pickQuestion: (o: never) => ResolvedQuestion | null }, idx: number): VoteState => {
    if (idx >= VOTE_ROUNDS) return { ...s, index: idx, round: null, done: true };
    const question = services.pickQuestion({ targetId: s.players[0], usage: "questionOnlyMinigame", formats: ["player"], tags: ["mostLikely"], participants: s.players } as never);
    if (!question) return { ...s, index: idx, round: null, done: true };
    const judge = opts.judge ? s.players[idx % s.players.length] : null;
    void now;
    return { ...s, index: idx, round: { question, stage: "vote", stageEndsAt: 0, votes: {}, winners: [], gained: {}, judge } };
  };
  return {
    id: opts.id,
    kind: "questionOnly",
    durationSec: opts.durationSec ?? 80,
    untimed: true,
    minPlayers: opts.selfVote ? 2 : 3,
    inputSchema: z.object({ answer: AnswerSchema }) as never,
    init: ({ players, services, now }) =>
      next({ players, index: 0, round: null, points: Object.fromEntries(players.map((p) => [p, 0])), done: false }, now, services as never, 0),
    onInput: (s, pid, input) => {
      const r = s.round;
      const a = (input as { answer: { kind: string; playerId?: string } }).answer;
      if (!r || r.stage !== "vote" || r.votes[pid] || a.kind !== "player" || !a.playerId || !s.players.includes(a.playerId)) return s;
      if (!opts.selfVote && a.playerId === pid) return s;
      return { ...s, round: { ...r, votes: { ...r.votes, [pid]: a.playerId } } };
    },
    tick: (s, { now, services }) => {
      const r = s.round;
      if (!r || s.done) return s;
      // Everyone who's still here voted (no clock: the host can end the mini-game if someone is AFK).
      if (r.stage === "vote" && s.players.every((p) => r.votes[p] || !services.isPresent(p))) {
        const { winners, gained } = opts.score(r.votes, s.players, r.judge);
        const points = { ...s.points };
        for (const [pid, n] of Object.entries(gained)) if (pid in points) points[pid] += n;
        return { ...s, points, round: { ...r, stage: "reveal", stageEndsAt: now + VOTE_REVEAL_MS, winners, gained } };
      }
      if (r.stage === "reveal" && now >= r.stageEndsAt) return next(s, now, services as never, s.index + 1);
      return s;
    },
    isFinished: (s) => s.done,
    onTimeout: (s) => ({ ...s, done: true }),
    results: (s) => rankByScore(s.players, s.points, true, (n) => `${n} pts`),
    publicState: (s): VotePublic => ({
      index: s.index,
      total: VOTE_ROUNDS,
      noSelfVote: !opts.selfVote,
      points: s.points,
      round: s.round
        ? {
            question: s.round.question,
            stage: s.round.stage,
            stageEndsAt: s.round.stageEndsAt,
            voted: Object.keys(s.round.votes),
            votes: s.round.stage === "reveal" ? s.round.votes : null,
            winners: s.round.winners,
            gained: s.round.stage === "reveal" ? s.round.gained : null,
            judge: s.round.judge,
          }
        : null,
    }),
    privateState: (s, pid) => ({ myVote: s.round?.votes[pid] ?? null }),
  };
}

// --- Scoring rules ----------------------------------------------------------

/** Most Likely To: everyone who picked the most-voted player scores 1. */
export function scoreMajority(votes: Record<PlayerId, PlayerId>) {
  const winners = majorityOf(votes);
  const gained: Record<PlayerId, number> = {};
  for (const [voter, choice] of Object.entries(votes)) if (winners.includes(choice)) gained[voter] = 1;
  return { winners, gained };
}

/** Judge's Call: matching the judge's pick scores 2; the judge scores 1 per player who matched. */
export function scoreJudge(votes: Record<PlayerId, PlayerId>, _players: PlayerId[], judge: PlayerId | null) {
  const pick = judge ? votes[judge] : undefined;
  if (!judge || !pick) return { winners: [], gained: {} };
  const gained: Record<PlayerId, number> = {};
  let matched = 0;
  for (const [voter, choice] of Object.entries(votes)) {
    if (voter === judge || choice !== pick) continue;
    gained[voter] = 2;
    matched++;
  }
  if (matched) gained[judge] = matched;
  return { winners: [pick], gained };
}

/** Hall of Fame: every vote you receive is a point; backing the round's top pick is another point. */
export function scoreHallOfFame(votes: Record<PlayerId, PlayerId>) {
  const counts = voteCounts(votes);
  const winners = majorityOf(votes);
  const gained: Record<PlayerId, number> = { ...counts };
  for (const [voter, choice] of Object.entries(votes)) if (winners.includes(choice)) gained[voter] = (gained[voter] ?? 0) + 1;
  return { winners, gained };
}
