import { GAME_CONFIG } from "../config/game";
import type { ContentBundle, Pack, Question, QuestionUsage } from "../content/schemas";
import type { DataQuestionGenerator, PlayerDataBundle } from "../data/types";
import { getFormat } from "../formats";
import { hasLanguage, localize, type Language } from "../i18n";
import { pick, shuffle, weightedPick, type Rng } from "../rng";
import type {
  Answer,
  PlayerId,
  PlayerQuestionResult,
  QuestionResult,
  ResolvedQuestion,
  RoomSettings,
} from "../engine/types";

export interface QuestionHistory {
  questionIds: string[];
  lastThemeId: string | null;
}

/** How many question ids a room remembers across games (oldest dropped first). */
export const RECENT_QUESTION_MEMORY = 800;

export interface SelectArgs {
  content: ContentBundle;
  settings: Pick<RoomSettings, "familyFriendly" | "language"> & { packs?: string[] };
  history: QuestionHistory;
  rng: Rng;
  usage: QuestionUsage;
  playerCount: number;
  formats?: string[];
  tags?: string[];
  /** Question ids asked in earlier games in this room, oldest first. Avoided while fresh ones remain. */
  recentIds?: string[];
}

interface Candidate {
  q: Question;
  pack: Pack;
}

function candidates(args: SelectArgs): Candidate[] {
  const { content, settings } = args;
  const out: Candidate[] = [];
  for (const pack of content.packs) {
    if (settings.packs && !settings.packs.includes(pack.id)) continue;
    for (const q of pack.questions) {
      if (q.truthSource) continue; // data questions come from generators
      if (!q.usage.includes(args.usage)) continue;
      if (settings.familyFriendly && q.tags?.includes("spicy")) continue;
      if ((q.minPlayers ?? 2) > args.playerCount) continue;
      // "Who would {target} call from jail?" needs at least two other players to choose from.
      if (q.format === "player" && excludesTarget(q) && args.playerCount < 3) continue;
      if (args.formats && !args.formats.includes(q.format)) continue;
      if (args.tags && !args.tags.some((t) => q.tags?.includes(t))) continue;
      const lang = hasLanguage(q.prompt, settings.language, pack.language) ? settings.language : "en";
      if (!hasLanguage(q.prompt, lang, pack.language)) continue;
      out.push({ q, pack });
    }
  }
  return out;
}

/** Normalized prompt text, so the same question in two packs (or a custom copy) counts as one. */
export function promptKey(q: Question): string {
  const text = typeof q.prompt === "string" ? q.prompt : (q.prompt.en ?? Object.values(q.prompt)[0] ?? "");
  return text.toLowerCase().replace(/[^a-z0-9{}]+/g, " ").trim();
}

/**
 * Weighted random from enabled packs. Never repeats a question within a game while unasked ones
 * remain, prefers questions this room hasn't seen in earlier games, and avoids the same theme twice
 * in a row when possible. Once everything has been asked, the least recently asked come back first.
 */
export function selectQuestion(args: SelectArgs): { question: Question; pack: Pack } | null {
  const all = candidates(args);
  if (all.length === 0) return null;
  const asked = args.history.questionIds;
  const recent = args.recentIds ?? [];
  // Prompts already asked this game (by text), so duplicates across packs never show twice.
  const byId = new Map(all.map((c) => [c.q.id, c]));
  const askedKeys = new Set(asked.map((id) => byId.get(id)).filter(Boolean).map((c) => promptKey(c!.q)));
  const unaskedThisGame = all.filter((c) => !asked.includes(c.q.id) && !askedKeys.has(promptKey(c.q)));

  let pool: Candidate[];
  if (unaskedThisGame.length > 0) {
    const neverSeen = unaskedThisGame.filter((c) => !recent.includes(c.q.id));
    pool = neverSeen.length > 0 ? neverSeen : leastRecent(unaskedThisGame, recent);
  } else {
    // Everything was asked this game: bring back the ones asked longest ago.
    pool = leastRecent(all, [...recent, ...asked]);
  }
  const fresh = pool.filter((c) => !c.q.themes.includes(args.history.lastThemeId ?? "\u0000"));
  if (fresh.length > 0) pool = fresh;
  const chosen = weightedPick(args.rng, pool, (c) => c.q.weight ?? 1)!;
  return { question: chosen.q, pack: chosen.pack };
}

/** The third of `pool` asked longest ago according to `order` (oldest first; never asked = oldest). */
function leastRecent(pool: Candidate[], order: string[]): Candidate[] {
  const last = new Map<string, number>();
  order.forEach((id, i) => last.set(id, i));
  const sorted = [...pool].sort((a, b) => (last.get(a.q.id) ?? -1) - (last.get(b.q.id) ?? -1));
  return sorted.slice(0, Math.max(1, Math.ceil(sorted.length / 3)));
}

/** Player questions about the target ("Who would {target} call…") don't offer the target as an answer. */
export function excludesTarget(q: Question): boolean {
  if (q.format !== "player" || q.allowTargetChoice) return false;
  const texts = typeof q.prompt === "string" ? [q.prompt] : Object.values(q.prompt);
  return texts.some((t) => t.includes("{target}"));
}

export interface ResolveArgs {
  targetId: PlayerId;
  names: Record<PlayerId, string>;
  participants: PlayerId[];
  rng: Rng;
  language: Language;
}

export function substitutePlaceholders(
  text: string,
  args: Pick<ResolveArgs, "targetId" | "names" | "participants" | "rng">,
): string {
  const others = args.participants.filter((p) => p !== args.targetId);
  const random = others.length ? pick(args.rng, others) : args.targetId;
  const otherChoices = others.filter((p) => p !== random);
  const other = otherChoices.length ? pick(args.rng, otherChoices) : random;
  return text
    .replaceAll("{target}", args.names[args.targetId] ?? "???")
    .replaceAll("{player:random}", args.names[random] ?? "???")
    .replaceAll("{otherPlayer}", args.names[other] ?? "???");
}

/** Turn a content question into what's shown this round: placeholders filled, answers shuffled. */
export function resolveQuestion(q: Question, pack: Pack, args: ResolveArgs): ResolvedQuestion {
  const lang = args.language;
  const loc = (s: Parameters<typeof localize>[0]) =>
    typeof s === "string" ? s : localize(s, lang);
  const themeId = q.themes[0];
  const base: ResolvedQuestion = {
    id: q.id,
    format: q.format,
    themeId,
    prompt: substitutePlaceholders(loc(q.prompt), args),
    isData: false,
    tags: q.tags,
  };
  if (q.answers && (q.format === "tiles" || q.format === "ranking")) {
    const opts = q.answers.map((a, i) => ({ id: `a${i}`, label: substitutePlaceholders(loc(a), args) }));
    // Same shuffled order for everyone in this round.
    base.options = shuffle(args.rng, opts);
  }
  if (q.format === "number" || q.format === "scale") {
    const spec = q.number ?? {
      min: 1,
      max: 10,
      step: 1,
      tolerance: { type: "absolute" as const, value: GAME_CONFIG.question.scaleTolerance },
    };
    base.number = {
      ...spec,
      unit: spec.unit ? loc(spec.unit) : undefined,
      minLabel: q.scaleLabels ? loc(q.scaleLabels.min) : undefined,
      maxLabel: q.scaleLabels ? loc(q.scaleLabels.max) : undefined,
    };
  }
  if (q.format === "higherLower") {
    base.reference = q.reference;
    if (q.number) base.number = { ...q.number, unit: q.number.unit ? loc(q.number.unit) : undefined };
  }
  if (q.format === "player")
    base.playerChoices = excludesTarget(q) ? args.participants.filter((p) => p !== args.targetId) : [...args.participants];
  void pack;
  return base;
}

/** Try data generators for the target. Returns null when there's not enough data. */
export function generateDataQuestion(args: {
  targetId: PlayerId;
  data: Record<PlayerId, PlayerDataBundle>;
  names: Record<PlayerId, string>;
  generators: Record<string, DataQuestionGenerator>;
  content: ContentBundle;
  history: QuestionHistory;
  rng: Rng;
  formats?: string[];
}): ResolvedQuestion | null {
  const own = args.data[args.targetId];
  if (!own || !Object.values(own).some(Boolean)) return null;
  // Data questions are declared in packs with a truthSource → generator id.
  const declared = args.content.packs.flatMap((p) => p.questions.filter((q) => q.truthSource));
  const available = declared.filter(
    (q) =>
      args.generators[q.truthSource!.generator] &&
      own[q.truthSource!.provider as keyof PlayerDataBundle] &&
      (!args.formats || args.formats.includes(q.format)),
  );
  const order = shuffle(args.rng, available);
  // prefer generators not used yet this game
  order.sort((a, b) => Number(args.history.questionIds.includes(a.id)) - Number(args.history.questionIds.includes(b.id)));
  for (const q of order) {
    const gen = args.generators[q.truthSource!.generator];
    const out = gen({ targetId: args.targetId, data: args.data, names: args.names, rng: args.rng });
    if (out) return { ...out, id: q.id, themeId: out.themeId || q.themes[0], isData: true, dataProvider: q.truthSource!.provider };
  }
  return null;
}

/**
 * Score one question round. Pure. `boosts` carries item effects (Wide Tolerance).
 * Coins follow GAME_CONFIG.question; set `payCoins` false to only compute matches.
 */
export function scoreQuestion(args: {
  question: ResolvedQuestion;
  targetId: PlayerId;
  participants: PlayerId[];
  answers: Record<PlayerId, Answer>;
  boosts?: Record<PlayerId, { wide?: boolean; double?: boolean }>;
  multiplier?: number;
  payCoins?: boolean;
}): QuestionResult {
  const { question: q, targetId, participants, answers } = args;
  const cfg = GAME_CONFIG.question;
  const fmt = getFormat(q.format);
  const truthFrom = q.isData ? "data" : "target";
  const truth: Answer | null = q.isData ? (q.truth ?? null) : (answers[targetId] ?? null);
  const mult = args.multiplier ?? 1;
  const pay = args.payCoins ?? true;
  const perPlayer: Record<PlayerId, PlayerQuestionResult> = {};
  let matchedCount = 0;
  const guessers = participants.filter((p) => p !== targetId);

  for (const pid of guessers) {
    const ans = answers[pid] ?? null;
    let r = { match: false, perfect: false, score: 0 };
    if (ans && truth) {
      r = fmt.compare(q, ans, truth, {
        toleranceMultiplier: args.boosts?.[pid]?.wide ? cfg.wideToleranceMultiplier : 1,
      });
    }
    let coins = 0;
    let close = false;
    if (r.match) matchedCount++;
    if (q.format === "scale" && ans?.kind === "number" && truth?.kind === "number") {
      // Graded: the closer to the target's rating, the more coins (Wide Tolerance halves the distance).
      const steps = Math.round(Math.abs(ans.value - truth.value) / (q.number?.step ?? 1));
      const effective = args.boosts?.[pid]?.wide ? Math.ceil(steps / cfg.wideToleranceMultiplier) : steps;
      coins = cfg.scaleCoinsByDistance[effective] ?? 0;
      close = !r.match && coins > 0;
    } else if (r.match) {
      coins += cfg.guesserMatchCoins;
      if (r.perfect && q.format === "number") coins += cfg.perfectBonusCoins;
    }
    const charm = args.boosts?.[pid]?.double ? 2 : 1;
    perPlayer[pid] = { answer: ans, isTarget: false, ...r, close, coins: pay ? coins * mult * charm : 0 };
  }

  const targetAnswer = answers[targetId] ?? null;
  let targetCoins = matchedCount * cfg.targetCoinsPerMatch * mult;
  let targetSelfCorrect: boolean | undefined;
  let targetCmp = { match: false, perfect: false, score: 0 };
  if (q.isData) {
    if (targetAnswer && truth) targetCmp = fmt.compare(q, targetAnswer, truth, {});
    targetSelfCorrect = targetCmp.match;
    if (targetSelfCorrect) targetCoins += cfg.dataTargetCorrectCoins;
  } else if (targetAnswer) {
    targetCmp = { match: true, perfect: true, score: 1 };
  }
  perPlayer[targetId] = {
    answer: targetAnswer,
    isTarget: true,
    ...targetCmp,
    coins: pay ? targetCoins : 0,
  };

  return { truth, truthFrom, perPlayer, matchedCount, guesserCount: guessers.length, targetSelfCorrect };
}

/** Prefer whoever has been target least; random among ties. */
export function leastTargeted(rng: Rng, candidates: PlayerId[], counts: Record<PlayerId, number>): PlayerId {
  const min = Math.min(...candidates.map((p) => counts[p] ?? 0));
  return pick(rng, candidates.filter((p) => (counts[p] ?? 0) === min));
}

/** Mini-game intro bonus rule: matchers get it; the target if at least half the guessers matched. */
export function bonusRecipients(result: QuestionResult, targetId: PlayerId): PlayerId[] {
  const out = Object.entries(result.perPlayer)
    .filter(([pid, r]) => pid !== targetId && r.match)
    .map(([pid]) => pid);
  const needed = Math.max(1, Math.ceil(result.guesserCount / 2));
  if (result.truthFrom === "data") {
    // The target doesn't decide the truth here: they get the bonus for knowing themselves.
    if (result.targetSelfCorrect) out.push(targetId);
  } else if (result.matchedCount >= needed) out.push(targetId);
  return out;
}
