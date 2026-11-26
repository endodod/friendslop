import type { z } from "zod";
import type { Rng } from "../rng";
import type { Language } from "../i18n";
import type { Answer, Placement, PlayerId, QuestionResult, ResolvedQuestion } from "../engine/types";
import type { QuestionUsage } from "../content/schemas";

export type MinigameKind = "soloScored" | "sharedRealtime" | "turnBased" | "questionOnly";

export interface PickQuestionOptions {
  targetId: PlayerId;
  usage: QuestionUsage;
  formats?: string[];
  tags?: string[];
  /** Restrict `player`-format choices to these players. */
  participants?: PlayerId[];
  allowData?: boolean;
}

/** Engine services available to mini-games (question selection, scoring, names). */
export interface MinigameServices {
  language: Language;
  names: Record<PlayerId, string>;
  allPlayers: PlayerId[];
  /** Coins at the start of the step (e.g. to cap auction bids). */
  coins: Record<PlayerId, number>;
  pickQuestion(opts: PickQuestionOptions): ResolvedQuestion | null;
  scoreAnswers(
    question: ResolvedQuestion,
    targetId: PlayerId,
    participants: PlayerId[],
    answers: Record<PlayerId, Answer>,
  ): QuestionResult;
  validateAnswer(question: ResolvedQuestion, answer: Answer): boolean;
  /** Least-targeted player (prefer fairness). */
  leastTargeted(candidates: PlayerId[]): PlayerId;
  noteTargeted(playerId: PlayerId): void;
  /** Still playing: connected, or only gone briefly (a refresh). Untimed steps wait for these players only. */
  isPresent(playerId: PlayerId): boolean;
}

export interface MinigameInitArgs {
  players: PlayerId[];
  bonuses: PlayerId[];
  seed: number;
  rng: Rng;
  now: number;
  services: MinigameServices;
}

export interface MinigameStepCtx {
  now: number;
  rng: Rng;
  services: MinigameServices;
}

/**
 * Every mini-game implements this. Server logic is pure: state in → state out.
 * Display metadata (name, icon, rules, bonus text, weight) lives in content/minigames.json.
 */
export interface MiniGameDefinition<State = any, Input = any, Submission = any> {
  id: string;
  kind: MinigameKind;
  durationSec: number;
  /**
   * No clock: answer/vote steps wait until everyone present has answered, and the host can end the
   * mini-game early. `durationSec` is ignored. Used by the vote and question mini-games.
   */
  untimed?: boolean;
  minPlayers: number;
  maxPlayers?: number;
  /** zod schema for `minigame:input` payloads */
  inputSchema?: z.ZodType<Input>;
  /** zod schema for `minigame:submit` payloads (soloScored) */
  submitSchema?: z.ZodType<Submission>;
  init(args: MinigameInitArgs): State;
  onInput?(state: State, playerId: PlayerId, input: Input, ctx: MinigameStepCtx): State;
  onSubmit?(state: State, playerId: PlayerId, submission: Submission, ctx: MinigameStepCtx): State;
  tick?(state: State, ctx: MinigameStepCtx): State;
  isFinished(state: State, now: number): boolean;
  /** Called when the time limit is reached; finalize anything pending. */
  onTimeout?(state: State, ctx: MinigameStepCtx): State;
  results(state: State): Placement[];
  /** Coin transfers between players instead of a payout (e.g. duel steals). Coins can't go below 0. */
  transfers?(state: State, placements: Placement[]): { from: PlayerId; to: PlayerId; amount: number }[];
  /** Override the default placement → coins payout. */
  payout?(state: State, placements: Placement[]): Record<PlayerId, number>;
  /** Players outside `participants` who may still send input (e.g. the duel's third-player target). */
  extraInputPlayers?(state: State): PlayerId[];
  /** What everyone may see. Never include secrets. */
  publicState(state: State, now: number): unknown;
  /** What one participant may see in addition (own answers, solo seed, bonus info). */
  privateState?(state: State, playerId: PlayerId, now: number): unknown;
}

export type MinigameRegistry = Record<string, MiniGameDefinition>;
