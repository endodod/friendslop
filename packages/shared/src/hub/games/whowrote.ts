import { z } from "zod";
import { fail } from "../../engine/errors";
import type { PlayerId } from "../../engine/types";
import type { WhoWrotePrompt } from "../../content/schemas";
import { shuffle } from "../../rng";
import { cleanText, goneLong, hubRanking, pickRandom, present, setPhase } from "../helpers";
import type { HubCtx, HubGameDefinition, HubHighlight, HubPhaseState, HubStatLine } from "../types";

/**
 * Who Wrote That?: everyone answers the same prompt about themselves, anonymously. Then the answers
 * come up one by one and everyone else guesses who wrote each one.
 */
export const WHOWROTE = {
  writeMs: 80_000,
  guessMs: 25_000,
  resultMs: 6_500,
  answerMaxLength: 80,
  points: { correct: 2, fooled: 1, laugh: 1 },
};

export interface WhoAnswerResult {
  authorId: PlayerId;
  text: string;
  guesses: Record<PlayerId, PlayerId>;
  laughs: PlayerId[];
  points: Record<PlayerId, number>;
}

export interface WhoRound {
  index: number;
  promptId: string;
  prompt: string;
  answers: Record<PlayerId, string>;
  /** Authors in reveal order (shuffled when writing ends). */
  order: PlayerId[];
  /** Index into `order` of the answer being guessed. */
  cursor: number;
  guesses: Record<PlayerId, PlayerId>;
  laughs: PlayerId[];
  /** Answers already revealed this round. */
  revealed: WhoAnswerResult[];
  skipped?: boolean;
}

export interface WhoStats {
  correct: number;
  guesses: number;
  /** Friends who guessed someone else for your answer. */
  fooled: number;
  /** Friends who guessed you right. */
  readBy: number;
  laughs: number;
  answers: number;
}

export interface WhoState extends HubPhaseState {
  phase: "write" | "guess" | "result" | "over";
  players: PlayerId[];
  prompts: WhoWrotePrompt[];
  round: WhoRound | null;
  history: WhoRound[];
  scores: Record<PlayerId, number>;
  stats: Record<PlayerId, WhoStats>;
  /** Who guessed whom right ("guesser>author"), for the best-friends highlight. */
  reads: Record<string, number>;
}

export const WhoActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("write"), text: z.string().min(1).max(160) }),
  z.object({ type: z.literal("guess"), playerId: z.string().max(64) }),
  /** 😂 on the answer being guessed (false takes it back). */
  z.object({ type: z.literal("laugh"), on: z.boolean() }),
]);
export type WhoAction = z.infer<typeof WhoActionSchema>;

/** Answers bots write (they don't have much of a personality). */
const BOT_ANSWERS = [
  "Honestly, pineapple on pizza",
  "I once cried at a car advert",
  "Three hours of cat videos",
  "My mum still does my taxes",
  "A tiny, angry goose",
  "I'd rather not say (it's bad)",
  "Napping professionally",
  "Karaoke, every single time",
  "A suspiciously large spoon collection",
  "Being late, but with style",
];

function emptyStats(): WhoStats {
  return { correct: 0, guesses: 0, fooled: 0, readBy: 0, laughs: 0, answers: 0 };
}

export function whoAuthor(r: Pick<WhoRound, "order" | "cursor">): PlayerId | null {
  return r.order[r.cursor] ?? null;
}

/** Who guesses the current answer: everyone but its author. */
export function whoGuessers(s: Pick<WhoState, "players" | "round">): PlayerId[] {
  const a = s.round ? whoAuthor(s.round) : null;
  return a ? s.players.filter((p) => p !== a) : [];
}

function startRound(s: WhoState, ctx: HubCtx) {
  const index = s.history.length;
  const prompt = s.prompts[index];
  if (!prompt) return setPhase(s, "over", null, ctx);
  s.round = { index, promptId: prompt.id, prompt: prompt.prompt, answers: {}, order: [], cursor: 0, guesses: {}, laughs: [], revealed: [] };
  ctx.emit({ type: "sfx", id: "whoosh" });
  setPhase(s, "write", WHOWROTE.writeMs, ctx);
}

function maybeEndWriting(s: WhoState, ctx: HubCtx) {
  const r = s.round;
  if (s.phase !== "write" || !r) return;
  if (s.players.every((p) => r.answers[p] !== undefined || !present(ctx, p))) startGuessing(s, ctx);
}

function startGuessing(s: WhoState, ctx: HubCtx) {
  const r = s.round!;
  const authors = s.players.filter((p) => r.answers[p] !== undefined);
  if (authors.length < 2) return skipRound(s, ctx, authors.length ? "Only one answer: next prompt." : "Nobody answered: next prompt.");
  for (const a of authors) s.stats[a].answers++;
  r.order = shuffle(ctx.rng, authors);
  r.cursor = 0;
  startGuess(s, ctx);
}

function startGuess(s: WhoState, ctx: HubCtx) {
  const r = s.round!;
  r.guesses = {};
  r.laughs = [];
  ctx.emit({ type: "sfx", id: "pop" });
  setPhase(s, "guess", WHOWROTE.guessMs, ctx);
}

function maybeEndGuess(s: WhoState, ctx: HubCtx) {
  const r = s.round;
  if (s.phase !== "guess" || !r) return;
  if (whoGuessers(s).every((p) => r.guesses[p] !== undefined || !present(ctx, p))) reveal(s, ctx);
}

function add(s: WhoState, points: Record<PlayerId, number>, pid: PlayerId, n: number) {
  if (!s.players.includes(pid)) return;
  points[pid] = (points[pid] ?? 0) + n;
}

function reveal(s: WhoState, ctx: HubCtx) {
  const r = s.round!;
  const author = whoAuthor(r)!;
  const P = WHOWROTE.points;
  const points: Record<PlayerId, number> = {};
  const right: PlayerId[] = [];
  for (const [pid, guess] of Object.entries(r.guesses)) {
    if (!s.players.includes(pid)) continue;
    s.stats[pid].guesses++;
    if (guess === author) {
      add(s, points, pid, P.correct);
      s.stats[pid].correct++;
      if (s.stats[author]) s.stats[author].readBy++;
      s.reads[`${pid}>${author}`] = (s.reads[`${pid}>${author}`] ?? 0) + 1;
      right.push(pid);
    } else {
      add(s, points, author, P.fooled);
      if (s.stats[author]) s.stats[author].fooled++;
    }
  }
  for (const pid of r.laughs) {
    if (pid === author || !s.players.includes(pid)) continue;
    add(s, points, author, P.laugh);
    if (s.stats[author]) s.stats[author].laughs++;
  }
  for (const [p, n] of Object.entries(points)) s.scores[p] = (s.scores[p] ?? 0) + n;
  r.revealed.push({ authorId: author, text: r.answers[author], guesses: { ...r.guesses }, laughs: [...r.laughs], points });
  if (right.length) ctx.emit({ type: "sfx", id: "match", playerIds: right });
  ctx.emit({ type: "sfx", id: "reveal" });
  setPhase(s, "result", WHOWROTE.resultMs, ctx);
}

function afterResult(s: WhoState, ctx: HubCtx) {
  const r = s.round!;
  r.cursor++;
  // Skip answers whose author left.
  while (r.cursor < r.order.length && !s.players.includes(r.order[r.cursor])) r.cursor++;
  if (r.cursor < r.order.length) return startGuess(s, ctx);
  nextRound(s, ctx);
}

function nextRound(s: WhoState, ctx: HubCtx) {
  if (s.round) s.history.push(s.round);
  s.round = null;
  startRound(s, ctx);
}

function skipRound(s: WhoState, ctx: HubCtx, why: string) {
  if (s.round) s.round.skipped = true;
  ctx.emit({ type: "toast", text: why });
  nextRound(s, ctx);
}

export interface WhoPublic {
  phase: WhoState["phase"];
  phaseStartedAt: number;
  phaseEndsAt: number | null;
  players: PlayerId[];
  totalRounds: number;
  round: {
    index: number;
    prompt: string;
    written: PlayerId[];
    /** Answers this round (count), and which one is up (1-based). */
    answerCount: number;
    answerNumber: number;
    /** The answer being guessed (author hidden until its result). */
    current: { text: string; authorId: PlayerId | null; guessed: PlayerId[]; laughs: number } | null;
    /** Answers already revealed this round (newest last). */
    revealed: WhoAnswerResult[];
    skipped?: boolean;
  } | null;
  scores: Record<PlayerId, number>;
}

export interface WhoPrivate {
  myAnswer: string | null;
  /** The answer being guessed is mine. */
  isMine: boolean;
  myGuess: PlayerId | null;
  myLaugh: boolean;
}

export const whoWrote: HubGameDefinition<WhoState, WhoAction> = {
  id: "whowrote",
  actionSchema: WhoActionSchema,

  init(players, ctx) {
    const rounds = ctx.settings.hub?.whowrote?.rounds ?? 3;
    const family = !!ctx.settings.familyFriendly;
    const pool = shuffle(
      ctx.rng,
      ctx.content.hub.whowrotePrompts.filter((p) => !family || !p.spicy),
    );
    if (pool.length < rounds) fail("INVALID_INPUT", "Who Wrote That? has no prompts.");
    return {
      phase: "write",
      phaseStartedAt: ctx.now,
      phaseEndsAt: null,
      players: [...players],
      prompts: pool.slice(0, rounds),
      round: null,
      history: [],
      scores: Object.fromEntries(players.map((p) => [p, 0])),
      stats: Object.fromEntries(players.map((p) => [p, emptyStats()])),
      reads: {},
    };
  },

  begin(s, ctx) {
    startRound(s, ctx);
  },

  action(s, pid, a, ctx) {
    const r = s.round;
    if (!r) fail("WRONG_PHASE", "Wait for the next prompt.");
    switch (a.type) {
      case "write": {
        if (s.phase !== "write") fail("WRONG_PHASE", "Writing time is over.");
        const text = cleanText(a.text, WHOWROTE.answerMaxLength);
        if (!text) fail("INVALID_INPUT", "Write something first.");
        const first = r.answers[pid] === undefined;
        r.answers[pid] = text;
        if (first) ctx.emit({ type: "answerLocked", playerId: pid });
        return maybeEndWriting(s, ctx);
      }
      case "guess": {
        if (s.phase !== "guess") fail("WRONG_PHASE", "You can't guess right now.");
        const author = whoAuthor(r);
        if (pid === author) fail("INVALID_INPUT", "That one's yours! Keep a straight face.");
        if (a.playerId === pid) fail("INVALID_INPUT", "You know you didn't write it!");
        if (!s.players.includes(a.playerId) || !r.order.includes(a.playerId)) fail("INVALID_INPUT", "They didn't answer this round.");
        if (r.guesses[pid] !== undefined) fail("INVALID_INPUT", "You already guessed.");
        r.guesses[pid] = a.playerId;
        ctx.emit({ type: "answerLocked", playerId: pid });
        return maybeEndGuess(s, ctx);
      }
      case "laugh": {
        if (s.phase !== "guess") fail("WRONG_PHASE", "You can't do that right now.");
        if (pid === whoAuthor(r)) fail("INVALID_INPUT", "No laughing at your own joke!");
        r.laughs = r.laughs.filter((p) => p !== pid);
        if (a.on) r.laughs.push(pid);
        return;
      }
    }
  },

  timeout(s, ctx) {
    switch (s.phase) {
      case "write":
        return startGuessing(s, ctx);
      case "guess":
        return reveal(s, ctx);
      case "result":
        return afterResult(s, ctx);
    }
  },

  stalled(s, ctx) {
    const r = s.round;
    if (!r) return false;
    let waiting: PlayerId[] = [];
    if (s.phase === "write") waiting = s.players.filter((p) => r.answers[p] === undefined);
    if (s.phase === "guess") waiting = whoGuessers(s).filter((p) => r.guesses[p] === undefined);
    return waiting.length > 0 && waiting.every((p) => goneLong(ctx, p));
  },

  autoplay(s, ctx) {
    if (s.phase === "write") startGuessing(s, ctx);
    else if (s.phase === "guess") reveal(s, ctx);
  },

  skip(s, ctx) {
    if (s.phase !== "result") return false;
    afterResult(s, ctx);
    return true;
  },

  removePlayer(s, pid, ctx) {
    s.players = s.players.filter((p) => p !== pid);
    delete s.scores[pid];
    if (s.players.length < 2) {
      if (s.round) s.history.push(s.round);
      s.round = null;
      return setPhase(s, "over", null, ctx);
    }
    const r = s.round;
    if (!r) return;
    delete r.guesses[pid];
    r.laughs = r.laughs.filter((p) => p !== pid);
    // Guesses for the player who left don't count.
    for (const [g, target] of Object.entries(r.guesses)) if (target === pid) delete r.guesses[g];
    if (s.phase === "write") {
      delete r.answers[pid];
      return maybeEndWriting(s, ctx);
    }
    if (s.phase === "guess" && whoAuthor(r) === pid) {
      ctx.emit({ type: "toast", text: "That answer's author left: next one." });
      return afterResult(s, ctx);
    }
    maybeEndGuess(s, ctx);
  },

  addPlayer(s, pid) {
    if (s.players.includes(pid)) return;
    // Everyone answers every question: they simply join in from the current step.
    s.players.push(pid);
    s.scores[pid] = 0;
    s.stats[pid] = emptyStats();
  },

  connectionChanged(s, ctx) {
    maybeEndWriting(s, ctx);
    maybeEndGuess(s, ctx);
  },

  isOver(s) {
    return s.phase === "over";
  },

  results(s, ctx) {
    const ranking = hubRanking(s.scores, s.players);
    const stats: Record<PlayerId, HubStatLine[]> = {};
    for (const p of s.players) {
      const st = s.stats[p];
      stats[p] = [
        { label: "Right guesses", value: `${st.correct}/${st.guesses}` },
        { label: "Friends fooled", value: st.fooled },
        { label: "Friends who knew you", value: st.readBy },
        { label: "😂 received", value: st.laughs },
      ];
    }
    const highlights: HubHighlight[] = [];
    const best = (f: (st: WhoStats) => number) => [...s.players].sort((a, b) => f(s.stats[b]) - f(s.stats[a]))[0];
    const det = best((st) => st.correct);
    if (det && s.stats[det].correct > 0)
      highlights.push({ icon: "magnifier", title: "Detective", text: `Named the author ${s.stats[det].correct} time${s.stats[det].correct > 1 ? "s" : ""}.`, playerIds: [det] });
    const mystery = best((st) => (st.answers ? st.fooled / st.answers : 0));
    if (mystery && s.stats[mystery].fooled > 0)
      highlights.push({ icon: "enigma", title: "Total mystery", text: `Fooled friends ${s.stats[mystery].fooled} time${s.stats[mystery].fooled > 1 ? "s" : ""}.`, playerIds: [mystery] });
    const open = best((st) => st.readBy);
    if (open && s.stats[open].readBy > 0)
      highlights.push({ icon: "open-book", title: "Open book", text: `Recognised ${s.stats[open].readBy} time${s.stats[open].readBy > 1 ? "s" : ""}.`, playerIds: [open] });
    const funny = best((st) => st.laughs);
    if (funny && s.stats[funny].laughs > 0)
      highlights.push({ icon: "party", title: "Crowd favourite", text: `${s.stats[funny].laughs} 😂 for their answers.`, playerIds: [funny] });
    const pair = Object.entries(s.reads).sort((a, b) => b[1] - a[1])[0];
    if (pair && pair[1] > 1) {
      const ids = pair[0].split(">").filter((p) => s.players.includes(p));
      if (ids.length === 2) highlights.push({ icon: "friends", title: "Knows you best", text: `spotted ${ctx.name(ids[1])} ${pair[1]} times.`, playerIds: [ids[0]] });
    }
    const top = ranking.filter((r) => r.rank === 1).map((r) => r.playerId);
    return {
      ranking,
      winners: top,
      headline: top.length > 1 ? `${top.map((p) => ctx.name(p)).join(" & ")} tie for the win!` : `${ctx.name(top[0] ?? "")} wins!`,
      scoreLabel: "points",
      stats,
      highlights,
    };
  },

  publicState(s): WhoPublic {
    const r = s.round;
    const author = r ? whoAuthor(r) : null;
    const answering = s.phase === "guess" || s.phase === "result";
    return {
      phase: s.phase,
      phaseStartedAt: s.phaseStartedAt,
      phaseEndsAt: s.phaseEndsAt,
      players: s.players,
      totalRounds: s.prompts.length,
      round: r
        ? {
            index: r.index,
            prompt: r.prompt,
            written: Object.keys(r.answers),
            answerCount: r.order.length,
            answerNumber: Math.min(r.order.length, r.cursor + 1),
            current:
              answering && author
                ? {
                    text: r.answers[author],
                    authorId: s.phase === "result" ? author : null,
                    guessed: Object.keys(r.guesses),
                    laughs: r.laughs.length,
                  }
                : null,
            revealed: r.revealed,
            skipped: r.skipped,
          }
        : null,
      scores: s.scores,
    };
  },

  privateState(s, pid): WhoPrivate {
    const r = s.round;
    if (!r || !pid) return { myAnswer: null, isMine: false, myGuess: null, myLaugh: false };
    return {
      myAnswer: r.answers[pid] ?? null,
      isMine: (s.phase === "guess" || s.phase === "result") && whoAuthor(r) === pid,
      myGuess: r.guesses[pid] ?? null,
      myLaugh: r.laughs.includes(pid),
    };
  },

  bot(s, bot, ctx) {
    const r = s.round;
    if (!r) return [];
    if (s.phase === "write" && r.answers[bot] === undefined) return [{ type: "write", text: pickRandom(ctx.rng, BOT_ANSWERS) ?? "Beep boop" }];
    if (s.phase === "guess" && whoAuthor(r) !== bot && r.guesses[bot] === undefined) {
      const choice = pickRandom(
        ctx.rng,
        r.order.filter((p) => p !== bot && s.players.includes(p)),
      );
      if (!choice) return [];
      const out: WhoAction[] = [{ type: "guess", playerId: choice }];
      if (ctx.rng() < 0.25) out.unshift({ type: "laugh", on: true });
      return out;
    }
    return [];
  },
};
