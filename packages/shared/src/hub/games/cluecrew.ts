import { z } from "zod";
import { fail } from "../../engine/errors";
import type { PlayerId } from "../../engine/types";
import { shuffle } from "../../rng";
import { cleanText, editDistance, goneLong, normalizeAnswer, pickRandom, present, setPhase, wordKey } from "../helpers";
import type { HubCtx, HubGameDefinition, HubHighlight, HubPhaseState, HubPlacement, HubStatLine } from "../types";

/**
 * Clue Crew (co-op): one guesser per card. Everyone else sees the secret word and writes one clue
 * word. Identical clues cancel out before the guesser sees them. One guess per card.
 */
export const CLUECREW = {
  clueMs: 60_000,
  checkMs: 20_000,
  guessMs: 45_000,
  resultMs: 8_000,
  clueMaxLength: 20,
  guessMaxLength: 30,
  /** With only two clue-givers, each writes this many clues. */
  cluesWhenTwo: 2,
};

/** End ratings (by share of the deck solved, highest first). */
export const CLUECREW_RATINGS: { min: number; rating: string; text: string }[] = [
  { min: 1, rating: "Hive mind", text: "Every single card. Are you sharing one brain?" },
  { min: 0.85, rating: "Mind-meld legends", text: "That was almost telepathic." },
  { min: 0.7, rating: "Seriously in sync", text: "Your friends get you. Mostly." },
  { min: 0.5, rating: "Solid crew", text: "More hits than misses. Respect." },
  { min: 0.3, rating: "Getting there", text: "Some great clues, some great disasters." },
  { min: 0, rating: "Do you even know each other?", text: "Next time, maybe don't all write the same word." },
];

export function clueCrewRating(score: number, total: number) {
  const share = total ? score / total : 0;
  return CLUECREW_RATINGS.find((r) => share >= r.min) ?? CLUECREW_RATINGS[CLUECREW_RATINGS.length - 1];
}

export interface CrewClue {
  id: string;
  by: PlayerId;
  text: string;
  /** dup = someone wrote the same; manual = a clue-giver struck it in the check (too close). */
  cancelled: "dup" | "manual" | null;
}

export type CrewOutcome = "correct" | "wrong" | "pass" | "skipped";

export interface CrewCard {
  index: number;
  word: string;
  guesserId: PlayerId;
  /** Per giver, in the order they typed them (built into `clues` when the check starts). */
  written: Record<PlayerId, string[]>;
  clues: CrewClue[];
  /** Clue-givers who tapped "Looks good" in the check. */
  okBy: PlayerId[];
  guess: string | null;
  outcome: CrewOutcome | null;
  /** A clue-giver counted a near miss (typo) as correct. */
  accepted?: boolean;
}

export interface CrewStats {
  clues: number;
  cancelled: number;
  /** Clues that reached the guesser on a card the team solved. */
  helped: number;
  guessed: number;
  turns: number;
}

export interface CrewState extends HubPhaseState {
  phase: "clue" | "check" | "guess" | "result" | "over";
  players: PlayerId[];
  deck: string[];
  /** Index into `deck` of the current card. */
  cardIndex: number;
  /** Cards lost to a wrong guess (the next card burns). */
  burned: string[];
  score: number;
  /** Seat order at the start (never shrinks), for the guesser rotation. */
  seats: PlayerId[];
  lastGuesser: PlayerId | null;
  card: CrewCard | null;
  history: CrewCard[];
  stats: Record<PlayerId, CrewStats>;
  /** Times two players cancelled each other ("a|b" sorted). */
  pairs: Record<string, number>;
}

export const CrewActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("clue"), texts: z.array(z.string().min(1).max(60)).min(1).max(2) }),
  /** Check: strike a clue that's too close to another (or take the strike back). */
  z.object({ type: z.literal("toggle"), clueId: z.string().max(8) }),
  z.object({ type: z.literal("ok") }),
  z.object({ type: z.literal("guess"), text: z.string().min(1).max(60) }),
  z.object({ type: z.literal("pass") }),
  /** Result: a clue-giver counts a near miss as correct. */
  z.object({ type: z.literal("accept") }),
]);
export type CrewAction = z.infer<typeof CrewActionSchema>;

function emptyStats(): CrewStats {
  return { clues: 0, cancelled: 0, helped: 0, guessed: 0, turns: 0 };
}

export function crewGivers(s: Pick<CrewState, "players" | "card">): PlayerId[] {
  return s.card ? s.players.filter((p) => p !== s.card!.guesserId) : [];
}

export function cluesPerGiver(players: number): number {
  return players - 1 <= 2 ? CLUECREW.cluesWhenTwo : 1;
}

/** Why a clue isn't allowed ("" = fine). */
export function crewClueProblem(clue: string, word: string): string {
  const c = cleanText(clue, CLUECREW.clueMaxLength);
  if (!c) return "Write a clue first.";
  if (/\s/.test(c)) return "One word only.";
  if (!/^[\p{L}\p{N}'-]+$/u.test(c)) return "Letters only, please.";
  const ck = wordKey(c);
  const wk = wordKey(word);
  if (!ck) return "Letters only, please.";
  if (ck === wk || (ck.length >= 3 && wk.includes(ck)) || (wk.length >= 3 && ck.includes(wk))) return "That's (part of) the secret word!";
  return "";
}

/** Does this guess count? Same word (plural etc. ignored), or one typo away for longer words. */
export function crewGuessMatches(guess: string, word: string): boolean {
  const g = wordKey(guess);
  const w = wordKey(word);
  if (!g) return false;
  if (g === w) return true;
  return w.length >= 5 && editDistance(normalizeAnswer(guess), normalizeAnswer(word)) <= 1;
}

function dealCard(s: CrewState, ctx: HubCtx) {
  if (s.cardIndex >= s.deck.length || s.players.length < 2) return setPhase(s, "over", null, ctx);
  const from = s.lastGuesser ? s.seats.indexOf(s.lastGuesser) : -1;
  let guesserId = s.players[0];
  for (let i = 1; i <= s.seats.length; i++) {
    const p = s.seats[(from + i + s.seats.length) % s.seats.length];
    if (s.players.includes(p)) {
      guesserId = p;
      break;
    }
  }
  s.lastGuesser = guesserId;
  s.card = { index: s.cardIndex, word: s.deck[s.cardIndex], guesserId, written: {}, clues: [], okBy: [], guess: null, outcome: null };
  s.stats[guesserId].turns++;
  ctx.emit({ type: "sfx", id: "whoosh" });
  setPhase(s, "clue", CLUECREW.clueMs, ctx);
}

function maybeEndClues(s: CrewState, ctx: HubCtx) {
  const c = s.card;
  if (s.phase !== "clue" || !c) return;
  if (crewGivers(s).every((p) => c.written[p] !== undefined || !present(ctx, p))) startCheck(s, ctx);
}

/** Build the clue list and cancel duplicates. */
function startCheck(s: CrewState, ctx: HubCtx) {
  const c = s.card!;
  const clues: CrewClue[] = [];
  for (const p of crewGivers(s)) for (const text of c.written[p] ?? []) clues.push({ id: `c${clues.length}`, by: p, text, cancelled: null });
  const byKey = new Map<string, CrewClue[]>();
  for (const cl of clues) {
    const k = wordKey(cl.text);
    byKey.set(k, [...(byKey.get(k) ?? []), cl]);
  }
  for (const same of byKey.values()) {
    if (same.length < 2) continue;
    for (const cl of same) cl.cancelled = "dup";
    const who = [...new Set(same.map((x) => x.by))].sort();
    for (let i = 0; i < who.length; i++)
      for (let j = i + 1; j < who.length; j++) {
        const key = `${who[i]}|${who[j]}`;
        s.pairs[key] = (s.pairs[key] ?? 0) + 1;
      }
  }
  c.clues = shuffle(ctx.rng, clues);
  for (const cl of c.clues) {
    if (!s.stats[cl.by]) continue;
    s.stats[cl.by].clues++;
    if (cl.cancelled) s.stats[cl.by].cancelled++;
  }
  if (!c.clues.length) return startGuess(s, ctx);
  if (c.clues.some((x) => x.cancelled)) ctx.emit({ type: "sfx", id: "bad" });
  setPhase(s, "check", CLUECREW.checkMs, ctx);
}

function maybeEndCheck(s: CrewState, ctx: HubCtx) {
  const c = s.card;
  if (s.phase !== "check" || !c) return;
  if (crewGivers(s).every((p) => c.okBy.includes(p) || !present(ctx, p))) startGuess(s, ctx);
}

function startGuess(s: CrewState, ctx: HubCtx) {
  ctx.emit({ type: "sfx", id: "reveal" });
  setPhase(s, "guess", CLUECREW.guessMs, ctx);
}

function finish(s: CrewState, outcome: CrewOutcome, ctx: HubCtx) {
  const c = s.card!;
  c.outcome = outcome;
  ctx.emit({ type: "sfx", id: outcome === "correct" ? "perfect" : outcome === "wrong" ? "miss" : "pop" });
  setPhase(s, "result", CLUECREW.resultMs, ctx);
}

/** Leave the result: count the card, burn the next one on a wrong guess, deal the next card. */
function nextCard(s: CrewState, ctx: HubCtx) {
  const c = s.card;
  if (c) {
    if (c.outcome === "correct") {
      s.score++;
      if (s.stats[c.guesserId]) s.stats[c.guesserId].guessed++;
      for (const cl of c.clues) if (!cl.cancelled && s.stats[cl.by]) s.stats[cl.by].helped++;
    } else if (c.outcome === "wrong") {
      if (s.cardIndex + 1 < s.deck.length) s.burned.push(...s.deck.splice(s.cardIndex + 1, 1));
      else s.score = Math.max(0, s.score - 1);
    }
    s.history.push(c);
  }
  s.card = null;
  s.cardIndex++;
  dealCard(s, ctx);
}

export interface CrewPublicClue {
  id: string;
  by: PlayerId;
  text: string;
  cancelled: CrewClue["cancelled"];
}

export interface CrewPublic {
  phase: CrewState["phase"];
  phaseStartedAt: number;
  phaseEndsAt: number | null;
  players: PlayerId[];
  deckSize: number;
  /** Cards still to come after this one. */
  remaining: number;
  score: number;
  burned: number;
  card: {
    index: number;
    guesserId: PlayerId;
    written: PlayerId[];
    okBy: PlayerId[];
    /** Guess and result: the clues the guesser gets. Result: the cancelled ones too. Never during clue/check. */
    clues: CrewPublicClue[] | null;
    /** How many clues were struck (shown during the guess). */
    cancelledCount: number;
    guess: string | null;
    outcome: CrewOutcome | null;
    accepted: boolean;
    /** Only at the result. */
    word: string | null;
    /** Result of a wrong guess: the card that burns with it (null on the last card). */
    burnsNext: boolean;
  } | null;
  history: { index: number; word: string; guesserId: PlayerId; outcome: CrewOutcome | null; guess: string | null }[];
  rating: { rating: string; text: string } | null;
}

export interface CrewPrivate {
  /** Clue-givers: the secret word. */
  word: string | null;
  isGuesser: boolean;
  cluesNeeded: number;
  mine: string[] | null;
  /** Clue-givers during the check: every clue with its strike. */
  check: CrewPublicClue[] | null;
  iOk: boolean;
}

export const clueCrew: HubGameDefinition<CrewState, CrewAction> = {
  id: "cluecrew",
  actionSchema: CrewActionSchema,

  init(players, ctx) {
    const cards = ctx.settings.hub?.cluecrew?.cards ?? 13;
    const words = ctx.content.hub.spygridWords;
    if (words.length < cards * 2) fail("INVALID_INPUT", "Clue Crew has no words.");
    // Seat order with a random first guesser.
    const start = Math.floor(ctx.rng() * players.length);
    const seats = [...players.slice(start), ...players.slice(0, start)];
    return {
      phase: "clue",
      phaseStartedAt: ctx.now,
      phaseEndsAt: null,
      players: [...seats],
      seats,
      lastGuesser: null,
      deck: shuffle(ctx.rng, words).slice(0, cards),
      cardIndex: 0,
      burned: [],
      score: 0,
      card: null,
      history: [],
      stats: Object.fromEntries(players.map((p) => [p, emptyStats()])),
      pairs: {},
    };
  },

  begin(s, ctx) {
    dealCard(s, ctx);
  },

  action(s, pid, a, ctx) {
    const c = s.card;
    if (!c) fail("WRONG_PHASE", "Wait for the next card.");
    const isGuesser = pid === c.guesserId;
    switch (a.type) {
      case "clue": {
        if (s.phase !== "clue") fail("WRONG_PHASE", "Clue time is over.");
        if (isGuesser) fail("INVALID_INPUT", "You're guessing this one!");
        const need = cluesPerGiver(s.players.length);
        if (a.texts.length !== need) fail("INVALID_INPUT", need > 1 ? `Write ${need} clues.` : "Write one clue.");
        const texts = a.texts.map((t) => cleanText(t, CLUECREW.clueMaxLength));
        for (const t of texts) {
          const problem = crewClueProblem(t, c.word);
          if (problem) fail("INVALID_INPUT", problem);
        }
        if (new Set(texts.map(wordKey)).size !== texts.length) fail("INVALID_INPUT", "Your two clues are the same.");
        const first = c.written[pid] === undefined;
        c.written[pid] = texts;
        if (first) ctx.emit({ type: "answerLocked", playerId: pid });
        return maybeEndClues(s, ctx);
      }
      case "toggle": {
        if (s.phase !== "check") fail("WRONG_PHASE", "You can't do that right now.");
        if (isGuesser) fail("INVALID_INPUT", "No peeking!");
        const cl = c.clues.find((x) => x.id === a.clueId);
        if (!cl) fail("INVALID_INPUT", "Unknown clue.");
        if (cl.cancelled === "dup") fail("INVALID_INPUT", "Duplicates are always out.");
        cl.cancelled = cl.cancelled === "manual" ? null : "manual";
        if (cl.cancelled && s.stats[cl.by]) s.stats[cl.by].cancelled++;
        else if (s.stats[cl.by]) s.stats[cl.by].cancelled = Math.max(0, s.stats[cl.by].cancelled - 1);
        // A strike changes what everyone agreed to.
        c.okBy = c.okBy.filter((p) => p === pid);
        return;
      }
      case "ok": {
        if (s.phase !== "check") fail("WRONG_PHASE", "You can't do that right now.");
        if (isGuesser) fail("INVALID_INPUT", "No peeking!");
        if (!c.okBy.includes(pid)) c.okBy.push(pid);
        return maybeEndCheck(s, ctx);
      }
      case "guess": {
        if (s.phase !== "guess") fail("WRONG_PHASE", "You can't guess right now.");
        if (!isGuesser) fail("INVALID_INPUT", "Only the guesser can guess.");
        const text = cleanText(a.text, CLUECREW.guessMaxLength);
        if (!text) fail("INVALID_INPUT", "Type a guess first.");
        c.guess = text;
        return finish(s, crewGuessMatches(text, c.word) ? "correct" : "wrong", ctx);
      }
      case "pass": {
        if (s.phase !== "guess") fail("WRONG_PHASE", "You can't pass right now.");
        if (!isGuesser) fail("INVALID_INPUT", "Only the guesser can pass.");
        return finish(s, "pass", ctx);
      }
      case "accept": {
        if (s.phase !== "result" || c.outcome !== "wrong") fail("WRONG_PHASE", "Nothing to count.");
        if (isGuesser) fail("INVALID_INPUT", "Nice try! A clue-giver has to count it.");
        c.outcome = "correct";
        c.accepted = true;
        ctx.emit({ type: "sfx", id: "perfect" });
        // A little more time to enjoy it.
        s.phaseEndsAt = Math.max(s.phaseEndsAt ?? ctx.now, ctx.now + 3000);
        return;
      }
    }
  },

  timeout(s, ctx) {
    switch (s.phase) {
      case "clue":
        return startCheck(s, ctx);
      case "check":
        return startGuess(s, ctx);
      case "guess":
        return finish(s, "pass", ctx);
      case "result":
        return nextCard(s, ctx);
    }
  },

  stalled(s, ctx) {
    const c = s.card;
    if (!c) return false;
    let waiting: PlayerId[] = [];
    if (s.phase === "clue") waiting = crewGivers(s).filter((p) => c.written[p] === undefined);
    if (s.phase === "check") waiting = crewGivers(s).filter((p) => !c.okBy.includes(p));
    if (s.phase === "guess") waiting = [c.guesserId];
    return waiting.length > 0 && waiting.every((p) => goneLong(ctx, p));
  },

  autoplay(s, ctx) {
    if (s.phase === "clue") startCheck(s, ctx);
    else if (s.phase === "check") startGuess(s, ctx);
    else if (s.phase === "guess") finish(s, "pass", ctx);
  },

  skip(s, ctx) {
    if (s.phase === "result") {
      nextCard(s, ctx);
      return true;
    }
    if (s.phase === "check") {
      startGuess(s, ctx);
      return true;
    }
    return false;
  },

  removePlayer(s, pid, ctx) {
    const c = s.card;
    const wasGuesser = c?.guesserId === pid;
    s.players = s.players.filter((p) => p !== pid);
    if (s.players.length < 2) {
      if (c) s.history.push(c);
      s.card = null;
      return setPhase(s, "over", null, ctx);
    }
    if (!c) return;
    if (wasGuesser && s.phase !== "result") {
      // No penalty: the card leaves the deck (everyone else has seen the word).
      c.outcome = "skipped";
      ctx.emit({ type: "toast", text: "The guesser left: new card." });
      s.deck.splice(s.cardIndex, 1);
      s.history.push(c);
      s.card = null;
      return dealCard(s, ctx);
    }
    delete c.written[pid];
    c.okBy = c.okBy.filter((p) => p !== pid);
    if (s.phase === "check" || s.phase === "guess") c.clues = c.clues.filter((x) => x.by !== pid);
    maybeEndClues(s, ctx);
    maybeEndCheck(s, ctx);
  },

  addPlayer(s, pid) {
    if (s.players.includes(pid)) return;
    // Last seat in the guesser rotation; they write clues from the current card on.
    s.players.push(pid);
    if (!s.seats.includes(pid)) s.seats.push(pid);
    s.stats[pid] = emptyStats();
  },

  connectionChanged(s, ctx) {
    maybeEndClues(s, ctx);
    maybeEndCheck(s, ctx);
  },

  isOver(s) {
    return s.phase === "over";
  },

  results(s, ctx) {
    const total = s.deck.length + s.burned.length;
    const r = clueCrewRating(s.score, total);
    const won = s.score / Math.max(1, total) >= 0.5;
    const ranking: HubPlacement[] = s.players.map((p) => ({ playerId: p, rank: 1, score: s.score }));
    const stats: Record<PlayerId, HubStatLine[]> = {};
    for (const p of s.players) {
      const st = s.stats[p];
      stats[p] = [
        { label: "Clues given", value: st.clues },
        { label: "Cancelled", value: st.cancelled },
        { label: "Clues on solved cards", value: st.helped },
        { label: "Guessed", value: `${st.guessed}/${st.turns}` },
      ];
    }
    const highlights: HubHighlight[] = [];
    const by = (f: (st: CrewStats) => number) => [...s.players].sort((a, b) => f(s.stats[b]) - f(s.stats[a]))[0];
    const helper = by((st) => st.helped);
    if (helper && s.stats[helper].helped > 0)
      highlights.push({ icon: "pointing", title: "MVP clue-giver", text: `${s.stats[helper].helped} clues on solved cards.`, playerIds: [helper] });
    const reader = by((st) => st.guessed * 10 - st.turns);
    if (reader && s.stats[reader].guessed > 0)
      highlights.push({ icon: "mind-reader", title: "Telepath", text: `Guessed ${s.stats[reader].guessed} of ${s.stats[reader].turns}.`, playerIds: [reader] });
    const pair = Object.entries(s.pairs).sort((a, b) => b[1] - a[1])[0];
    if (pair && pair[1] > 0) {
      const ids = pair[0].split("|").filter((p) => s.players.includes(p));
      if (ids.length === 2)
        highlights.push({ icon: "friends", title: "Great minds", text: `Wrote the same clue ${pair[1]} time${pair[1] > 1 ? "s" : ""} (and cancelled each other).`, playerIds: ids });
    }
    const clash = by((st) => st.cancelled);
    if (clash && s.stats[clash].cancelled > 1)
      highlights.push({ icon: "bomb", title: "Too obvious", text: `${s.stats[clash].cancelled} clues struck.`, playerIds: [clash] });
    return {
      ranking,
      winners: won ? [...s.players] : [],
      headline: r.rating,
      scoreLabel: "cards",
      stats,
      highlights,
      coop: { score: s.score, total, rating: r.rating, text: r.text },
    };
  },

  publicState(s): CrewPublic {
    const c = s.card;
    const showClues = s.phase === "guess" || s.phase === "result";
    const result = s.phase === "result";
    const total = s.deck.length + s.burned.length;
    return {
      phase: s.phase,
      phaseStartedAt: s.phaseStartedAt,
      phaseEndsAt: s.phaseEndsAt,
      players: s.players,
      deckSize: total,
      remaining: Math.max(0, s.deck.length - s.cardIndex - 1),
      score: s.score,
      burned: s.burned.length,
      card: c
        ? {
            index: c.index,
            guesserId: c.guesserId,
            written: Object.keys(c.written),
            okBy: c.okBy,
            clues: showClues
              ? c.clues.filter((x) => result || !x.cancelled).map((x) => ({ id: x.id, by: x.by, text: x.text, cancelled: x.cancelled }))
              : null,
            cancelledCount: c.clues.filter((x) => x.cancelled).length,
            guess: result ? c.guess : null,
            outcome: result ? c.outcome : null,
            accepted: !!c.accepted,
            word: result ? c.word : null,
            burnsNext: result && c.outcome === "wrong" && s.cardIndex + 1 < s.deck.length,
          }
        : null,
      history: s.history.map((h) => ({ index: h.index, word: h.word, guesserId: h.guesserId, outcome: h.outcome, guess: h.guess })),
      rating: s.phase === "over" ? clueCrewRating(s.score, total) : null,
    };
  },

  privateState(s, pid): CrewPrivate {
    const c = s.card;
    const none: CrewPrivate = { word: null, isGuesser: false, cluesNeeded: cluesPerGiver(s.players.length), mine: null, check: null, iOk: false };
    if (!c || !pid || !s.players.includes(pid)) return none;
    if (pid === c.guesserId) return { ...none, isGuesser: true };
    return {
      ...none,
      word: c.word,
      mine: c.written[pid] ?? null,
      check: s.phase === "check" ? c.clues.map((x) => ({ id: x.id, by: x.by, text: x.text, cancelled: x.cancelled })) : null,
      iOk: c.okBy.includes(pid),
    };
  },

  bot(s, bot, ctx) {
    const c = s.card;
    if (!c) return [];
    const isGuesser = bot === c.guesserId;
    if (s.phase === "clue" && !isGuesser && c.written[bot] === undefined) {
      const need = cluesPerGiver(s.players.length);
      const pool = ctx.content.hub.spygridWords.filter((w) => !crewClueProblem(w, c.word));
      // A small shared pool so bots sometimes clash (and cancel each other).
      const shared = pool.slice(0, 6);
      const texts: string[] = [];
      while (texts.length < need) {
        const w = (ctx.rng() < 0.3 ? pickRandom(ctx.rng, shared) : pickRandom(ctx.rng, pool)) ?? "BEEP";
        if (!texts.some((t) => wordKey(t) === wordKey(w))) texts.push(w);
      }
      return [{ type: "clue", texts: texts.map((t) => t.toLowerCase()) }];
    }
    if (s.phase === "check" && !isGuesser && !c.okBy.includes(bot)) return [{ type: "ok" }];
    if (s.phase === "guess" && isGuesser) {
      // Test bots peek half the time, so games with bots aren't all misses.
      if (ctx.rng() < 0.5) return [{ type: "guess", text: c.word.toLowerCase() }];
      if (ctx.rng() < 0.3) return [{ type: "pass" }];
      return [{ type: "guess", text: (pickRandom(ctx.rng, ctx.content.hub.spygridWords) ?? "beep").toLowerCase() }];
    }
    return [];
  },
};
