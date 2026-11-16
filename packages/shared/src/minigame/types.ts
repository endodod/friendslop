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
  /** Override the default placement → coins payout (e.g. duel steals). */
  payout?(state: State, placements: Placement[]): Record<PlayerId, number>;
  /** What everyone may see. Never include secrets. */
  publicState(state: State, now: number): unknown;
  /** What one participant may see in addition (own answers, solo seed, bonus info). */
  privateState?(state: State, playerId: PlayerId, now: number): unknown;
}

export type MinigameRegistry = Record<string, MiniGameDefinition>;
