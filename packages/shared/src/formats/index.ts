import { GAME_CONFIG } from "../config/game";
import type { QuestionFormat, Tolerance } from "../content/schemas";
import type { Answer, PlayerId, ResolvedQuestion } from "../engine/types";

export interface CompareResult {
  match: boolean;
  perfect: boolean;
  /** 0..1 closeness */
  score: number;
}

export interface CompareOptions {
  /** Wide Tolerance item. */
  toleranceMultiplier?: number;
}

/**
 * An answer format is a pluggable module: which answer shape it takes, how to validate it,
 * and how a guess is matched against the truth. UI lives in apps/web/components/formats.
 */
export interface AnswerFormat {
  format: QuestionFormat;
  answerKind: Answer["kind"];
  /** Is this a well-formed answer for this question? */
  validate(q: ResolvedQuestion, a: Answer): boolean;
  compare(q: ResolvedQuestion, guess: Answer, truth: Answer, opts?: CompareOptions): CompareResult;
  /** Do discrete answer counts make sense (for the Peek item)? */
  discrete: boolean;
  /** Does the Wide Tolerance item apply? */
  usesTolerance: boolean;
}

export function withinTolerance(guess: number, truth: number, tol: Tolerance, step: number, multiplier = 1): boolean {
  const allowed =
    tol.type === "absolute" ? tol.value * multiplier : Math.max(Math.abs(truth) * tol.value, step) * multiplier;
  return Math.abs(guess - truth) <= allowed + 1e-9;
}

const NO: CompareResult = { match: false, perfect: false, score: 0 };

const tiles: AnswerFormat = {
  format: "tiles",
  answerKind: "option",
  discrete: true,
  usesTolerance: false,
  validate: (q, a) => a.kind === "option" && !!q.options?.some((o) => o.id === a.optionId),
  compare: (_q, g, t) => {
    if (g.kind !== "option" || t.kind !== "option") return NO;
    const m = g.optionId === t.optionId;
    return { match: m, perfect: m, score: m ? 1 : 0 };
  },
};

function numberCompare(q: ResolvedQuestion, g: Answer, t: Answer, opts?: CompareOptions, defaultTol?: Tolerance): CompareResult {
  if (g.kind !== "number" || t.kind !== "number" || !q.number) return NO;
  const tol = defaultTol ?? q.number.tolerance;
  const m = withinTolerance(g.value, t.value, tol, q.number.step, opts?.toleranceMultiplier ?? 1);
  const perfect = Math.abs(g.value - t.value) < 1e-9;
  const range = Math.max(q.number.max - q.number.min, 1e-9);
  return { match: m, perfect, score: Math.max(0, 1 - Math.abs(g.value - t.value) / range) };
}

function numberValidate(q: ResolvedQuestion, a: Answer): boolean {
  if (a.kind !== "number" || !q.number) return false;
  const { min, max, step } = q.number;
  if (a.value < min - 1e-9 || a.value > max + 1e-9) return false;
  const k = (a.value - min) / step;
  return Math.abs(k - Math.round(k)) < 1e-6;
}

const number: AnswerFormat = {
  format: "number",
  answerKind: "number",
  discrete: false,
  usesTolerance: true,
  validate: numberValidate,
  compare: (q, g, t, o) => numberCompare(q, g, t, o),
};

const scale: AnswerFormat = {
  format: "scale",
  answerKind: "number",
  discrete: false,
  usesTolerance: true,
  validate: numberValidate,
  compare: (q, g, t, o) =>
    numberCompare(q, g, t, o, q.number?.tolerance ?? { type: "absolute", value: GAME_CONFIG.question.scaleTolerance }),
};

const player: AnswerFormat = {
  format: "player",
  answerKind: "player",
  discrete: true,
  usesTolerance: false,
  validate: (q, a) => a.kind === "player" && !!q.playerChoices?.includes(a.playerId),
  compare: (_q, g, t) => {
    if (g.kind !== "player" || t.kind !== "player") return NO;
    const m = g.playerId === t.playerId;
    return { match: m, perfect: m, score: m ? 1 : 0 };
  },
};

const ranking: AnswerFormat = {
  format: "ranking",
  answerKind: "order",
  discrete: false,
  usesTolerance: false,
  validate: (q, a) => {
    if (a.kind !== "order" || !q.options) return false;
    const ids = q.options.map((o) => o.id).sort();
    const given = [...a.optionIds].sort();
    return ids.length === given.length && ids.every((id, i) => id === given[i]);
  },
  compare: (_q, g, t) => {
    if (g.kind !== "order" || t.kind !== "order") return NO;
    const n = t.optionIds.length;
    const correct = t.optionIds.filter((id, i) => g.optionIds[i] === id).length;
    const score = n ? correct / n : 0;
    return { match: score >= GAME_CONFIG.question.rankingMatchShare, perfect: correct === n, score };
  },
};

const higherLower: AnswerFormat = {
  format: "higherLower",
  answerKind: "hl",
  discrete: true,
  usesTolerance: false,
  validate: (_q, a) => a.kind === "hl",
  compare: (_q, g, t) => {
    if (g.kind !== "hl" || t.kind !== "hl") return NO;
    const m = g.dir === t.dir;
    return { match: m, perfect: m, score: m ? 1 : 0 };
  },
};

export const ANSWER_FORMATS: Record<QuestionFormat, AnswerFormat> = { tiles, number, scale, player, ranking, higherLower };

export function getFormat(f: QuestionFormat): AnswerFormat {
  return ANSWER_FORMATS[f];
}

export function validateAnswer(q: ResolvedQuestion, a: Answer): boolean {
  return getFormat(q.format).validate(q, a);
}

/** Key used to bucket discrete answers (Peek item, reveal grouping). */
export function answerKey(a: Answer): string {
  switch (a.kind) {
    case "option":
      return `o:${a.optionId}`;
    case "player":
      return `p:${a.playerId}`;
    case "hl":
      return `h:${a.dir}`;
    case "number":
      return `n:${a.value}`;
    case "order":
      return `r:${a.optionIds.join(",")}`;
  }
}

export function countAnswers(answers: Record<PlayerId, Answer>, exclude: PlayerId[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [pid, a] of Object.entries(answers)) {
    if (exclude.includes(pid)) continue;
    const k = answerKey(a);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}
