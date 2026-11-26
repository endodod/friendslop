import { z } from "zod";
import { fail } from "../../engine/errors";
import type { PlayerId } from "../../engine/types";
import { shuffle } from "../../rng";
import { cleanText, goneLong, hubRanking, pickRandom, present, setPhase, wordKey } from "../helpers";
import type { HubCtx, HubGameDefinition, HubHighlight, HubPhaseState, HubStatLine } from "../types";
import { crewClueProblem, crewGuessMatches } from "./cluecrew";

/**
 * Odd Word Out: everyone gets the same secret word, except one player who gets a close one (and
 * doesn't know it). Players take turns giving one-word clues, then vote for the odd one out.
 */
export const ODDWORD = {
  clueMs: 30_000,
  voteMs: 45_000,
  lastChanceMs: 30_000,
  resultMs: 9_000,
  laps: 2,
  clueMaxLength: 20,
  guessMaxLength: 30,
  points: { caught: 2, survived: 4, stolen: 3 },
};

export interface OddClue {
  playerId: PlayerId;
  /** null = ran out of time. */
  text: string | null;
}

export interface OddRound {
  index: number;
  crowdWord: string;
  oddWord: string;
  oddId: PlayerId;
  /** Clue order (rotates every round). */
  order: PlayerId[];
  /** Turns taken so far (order.length × laps in total). */
  turn: number;
  clues: OddClue[];
  votes: Record<PlayerId, PlayerId>;
  accusedId: PlayerId | null;
  caught: boolean;
  guess: string | null;
  stolen: boolean;
  points: Record<PlayerId, number> | null;
  skipped?: boolean;
}

export interface OddStats {
  timesOdd: number;
  survived: number;
  stolen: number;
  /** Votes for the real odd one out. */
  goodVotes: number;
  votes: number;
  /** Votes received while NOT being the odd one out. */
  suspected: number;
}

export interface OddState extends HubPhaseState {
  phase: "clue" | "vote" | "lastchance" | "result" | "over";
  players: PlayerId[];
  schedule: { pair: [string, string]; oddId: PlayerId }[];
  round: OddRound | null;
  history: OddRound[];
  scores: Record<PlayerId, number>;
  stats: Record<PlayerId, OddStats>;
}

export const OddActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("clue"), text: z.string().min(1).max(60) }),
  z.object({ type: z.literal("vote"), playerId: z.string().max(64) }),
  z.object({ type: z.literal("guess"), text: z.string().min(1).max(60) }),
]);
export type OddAction = z.infer<typeof OddActionSchema>;

function emptyStats(): OddStats {
  return { timesOdd: 0, survived: 0, stolen: 0, goodVotes: 0, votes: 0, suspected: 0 };
}

/** Whose turn it is to give a clue. */
export function oddTurnPlayer(r: Pick<OddRound, "order" | "turn">): PlayerId | null {
  return r.order.length ? r.order[r.turn % r.order.length] : null;
}

function wordOf(r: OddRound, pid: PlayerId): string {
  return pid === r.oddId ? r.oddWord : r.crowdWord;
}

function startRound(s: OddState, ctx: HubCtx) {
  const index = s.history.length;
  const next = s.schedule[index];
  if (!next) return setPhase(s, "over", null, ctx);
  if (!s.players.includes(next.oddId)) next.oddId = pickRandom(ctx.rng, s.players)!;
  const flip = ctx.rng() < 0.5;
  const [crowdWord, oddWord] = flip ? [next.pair[1], next.pair[0]] : next.pair;
  const shift = index % s.players.length;
  s.round = {
    index,
    crowdWord,
    oddWord,
    oddId: next.oddId,
    order: [...s.players.slice(shift), ...s.players.slice(0, shift)],
    turn: 0,
    clues: [],
    votes: {},
    accusedId: null,
    caught: false,
    guess: null,
    stolen: false,
    points: null,
  };
  s.stats[next.oddId].timesOdd++;
  ctx.emit({ type: "sfx", id: "whoosh" });
  setPhase(s, "clue", ODDWORD.clueMs, ctx);
}

function nextTurn(s: OddState, ctx: HubCtx) {
  const r = s.round!;
  r.turn++;
  if (r.turn >= r.order.length * ODDWORD.laps) {
    ctx.emit({ type: "sfx", id: "drumroll" });
    return setPhase(s, "vote", ODDWORD.voteMs, ctx);
  }
  setPhase(s, "clue", ODDWORD.clueMs, ctx);
}

function maybeEndVote(s: OddState, ctx: HubCtx) {
  const r = s.round;
  if (s.phase !== "vote" || !r) return;
  if (s.players.every((p) => r.votes[p] !== undefined || !present(ctx, p))) tally(s, ctx);
}

function add(points: Record<PlayerId, number>, pid: PlayerId, n: number) {
  points[pid] = (points[pid] ?? 0) + n;
}

function tally(s: OddState, ctx: HubCtx) {
  const r = s.round!;
  const count: Record<PlayerId, number> = {};
  for (const [voter, target] of Object.entries(r.votes)) {
    if (!s.players.includes(voter) || !s.players.includes(target)) continue;
    count[target] = (count[target] ?? 0) + 1;
    s.stats[voter].votes++;
    if (target === r.oddId) s.stats[voter].goodVotes++;
    else s.stats[target].suspected++;
  }
  const max = Math.max(0, ...Object.values(count));
  const top = Object.keys(count).filter((p) => count[p] === max);
  r.accusedId = max > 0 && top.length === 1 ? top[0] : null;
  r.caught = r.accusedId === r.oddId;
  if (r.caught && present(ctx, r.oddId)) {
    ctx.emit({ type: "sfx", id: "reveal" });
    return setPhase(s, "lastchance", ODDWORD.lastChanceMs, ctx);
  }
  finish(s, ctx);
}

function finish(s: OddState, ctx: HubCtx) {
  const r = s.round!;
  const P = ODDWORD.points;
  const points: Record<PlayerId, number> = {};
  if (r.caught) {
    for (const [voter, target] of Object.entries(r.votes)) if (target === r.oddId && s.players.includes(voter)) add(points, voter, P.caught);
    if (r.stolen) {
      add(points, r.oddId, P.stolen);
      s.stats[r.oddId].stolen++;
    }
  } else {
    add(points, r.oddId, P.survived);
    s.stats[r.oddId].survived++;
  }
  for (const [p, n] of Object.entries(points)) if (s.players.includes(p)) s.scores[p] = (s.scores[p] ?? 0) + n;
  r.points = points;
  ctx.emit({ type: "sfx", id: r.caught && !r.stolen ? "win" : "bad" });
  setPhase(s, "result", ODDWORD.resultMs, ctx);
}

function nextRound(s: OddState, ctx: HubCtx) {
  if (s.round) s.history.push(s.round);
  s.round = null;
  startRound(s, ctx);
}

export interface OddPublic {
  phase: OddState["phase"];
  phaseStartedAt: number;
  phaseEndsAt: number | null;
  players: PlayerId[];
  totalRounds: number;
  laps: number;
  round: {
    index: number;
    order: PlayerId[];
    turn: number;
    turnPlayerId: PlayerId | null;
    clues: OddClue[];
    voted: PlayerId[];
    /** From the last chance on. */
    votes: Record<PlayerId, PlayerId> | null;
    accusedId: PlayerId | null;
    caught: boolean | null;
    /** The odd one out: known at the last chance (if caught) and the result. */
    oddId: PlayerId | null;
    /** Only at the result. */
    crowdWord: string | null;
    oddWord: string | null;
    guess: string | null;
    stolen: boolean;
    points: Record<PlayerId, number> | null;
    skipped?: boolean;
  } | null;
  scores: Record<PlayerId, number>;
}

export interface OddPrivate {
  word: string | null;
  myVote: PlayerId | null;
}

export const oddWord: HubGameDefinition<OddState, OddAction> = {
  id: "oddword",
  actionSchema: OddActionSchema,

  init(players, ctx) {
    const rounds = ctx.settings.hub?.oddword?.rounds ?? 5;
    const pairs = shuffle(ctx.rng, ctx.content.hub.oddwordPairs);
    if (pairs.length < rounds) fail("INVALID_INPUT", "Odd Word Out has no words.");
    // Everyone is the odd one out about equally often.
    const odds: PlayerId[] = [];
    while (odds.length < rounds) odds.push(...shuffle(ctx.rng, players));
    return {
      phase: "clue",
      phaseStartedAt: ctx.now,
      phaseEndsAt: null,
      players: [...players],
      schedule: pairs.slice(0, rounds).map((pair, i) => ({ pair: [pair[0], pair[1]] as [string, string], oddId: odds[i] })),
      round: null,
      history: [],
      scores: Object.fromEntries(players.map((p) => [p, 0])),
      stats: Object.fromEntries(players.map((p) => [p, emptyStats()])),
    };
  },

  begin(s, ctx) {
    startRound(s, ctx);
  },

  action(s, pid, a, ctx) {
    const r = s.round;
    if (!r) fail("WRONG_PHASE", "Wait for the next round.");
    switch (a.type) {
      case "clue": {
        if (s.phase !== "clue") fail("WRONG_PHASE", "Clue time is over.");
        if (oddTurnPlayer(r) !== pid) fail("INVALID_INPUT", "It's not your turn.");
        const text = cleanText(a.text, ODDWORD.clueMaxLength);
        const problem = crewClueProblem(text, wordOf(r, pid));
        if (problem) fail("INVALID_INPUT", problem);
        if (r.clues.some((c) => c.text && wordKey(c.text) === wordKey(text))) fail("INVALID_INPUT", "Someone already said that.");
        r.clues.push({ playerId: pid, text });
        ctx.emit({ type: "sfx", id: "pop" });
        return nextTurn(s, ctx);
      }
      case "vote": {
        if (s.phase !== "vote") fail("WRONG_PHASE", "You can't vote right now.");
        if (a.playerId === pid) fail("INVALID_INPUT", "You can't vote for yourself.");
        if (!s.players.includes(a.playerId)) fail("INVALID_INPUT", "Unknown player.");
        const first = r.votes[pid] === undefined;
        r.votes[pid] = a.playerId;
        if (first) ctx.emit({ type: "answerLocked", playerId: pid });
        return maybeEndVote(s, ctx);
      }
      case "guess": {
        if (s.phase !== "lastchance") fail("WRONG_PHASE", "You can't guess right now.");
        if (pid !== r.oddId) fail("INVALID_INPUT", "Only the odd one out guesses.");
        const text = cleanText(a.text, ODDWORD.guessMaxLength);
        if (!text) fail("INVALID_INPUT", "Type a guess first.");
        r.guess = text;
        r.stolen = crewGuessMatches(text, r.crowdWord);
        return finish(s, ctx);
      }
    }
  },

  timeout(s, ctx) {
    const r = s.round;
    if (!r) return;
    switch (s.phase) {
      case "clue":
        r.clues.push({ playerId: oddTurnPlayer(r)!, text: null });
        return nextTurn(s, ctx);
      case "vote":
        return tally(s, ctx);
      case "lastchance":
        return finish(s, ctx);
      case "result":
        return nextRound(s, ctx);
    }
  },

  stalled(s, ctx) {
    const r = s.round;
    if (!r) return false;
    if (s.phase === "clue") return goneLong(ctx, oddTurnPlayer(r)!);
    if (s.phase === "lastchance") return goneLong(ctx, r.oddId);
    if (s.phase === "vote") {
      const waiting = s.players.filter((p) => r.votes[p] === undefined);
      return waiting.length > 0 && waiting.every((p) => goneLong(ctx, p));
    }
    return false;
  },

  autoplay(s, ctx) {
    if (s.phase === "clue" || s.phase === "vote" || s.phase === "lastchance") oddWord.timeout(s, ctx);
  },

  skip(s, ctx) {
    if (s.phase !== "result") return false;
    nextRound(s, ctx);
    return true;
  },

  removePlayer(s, pid, ctx) {
    s.players = s.players.filter((p) => p !== pid);
    delete s.scores[pid];
    if (s.players.length < 3) {
      if (s.round) s.history.push(s.round);
      s.round = null;
      return setPhase(s, "over", null, ctx);
    }
    const r = s.round;
    if (!r) return;
    if (r.oddId === pid && s.phase !== "result") {
      r.skipped = true;
      ctx.emit({ type: "toast", text: "The odd one out left: new round." });
      return nextRound(s, ctx);
    }
    for (const [v, t] of Object.entries(r.votes)) if (v === pid || t === pid) delete r.votes[v];
    if (s.phase === "clue") {
      const wasTurn = oddTurnPlayer(r) === pid;
      // Keep the turn count consistent with the shorter order.
      const lap = Math.floor(r.turn / r.order.length);
      const pos = r.turn % r.order.length;
      const idx = r.order.indexOf(pid);
      r.order = r.order.filter((p) => p !== pid);
      r.turn = lap * r.order.length + (idx < pos ? pos - 1 : pos);
      if (wasTurn) {
        r.turn--;
        return nextTurn(s, ctx);
      }
      return;
    }
    r.order = r.order.filter((p) => p !== pid);
    maybeEndVote(s, ctx);
  },

  addPlayer(s, pid, ctx) {
    if (s.players.includes(pid)) return;
    s.players.push(pid);
    s.scores[pid] = 0;
    s.stats[pid] = emptyStats();
    // One more round at the end, with them as the odd one out and a pair nobody had yet.
    const used = new Set(s.schedule.map((x) => x.pair.join("|")));
    const pair = pickRandom(
      ctx.rng,
      ctx.content.hub.oddwordPairs.filter((p) => !used.has(p.join("|"))),
    );
    if (pair) s.schedule.push({ pair: [pair[0], pair[1]], oddId: pid });
  },

  connectionChanged(s, ctx) {
    maybeEndVote(s, ctx);
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
        { label: "Spotted the odd one", value: `${st.goodVotes}/${st.votes}` },
        { label: "Odd one out", value: `${st.timesOdd}×` },
        { label: "Got away", value: st.survived },
        { label: "Wrongly suspected", value: st.suspected },
      ];
      if (st.stolen) stats[p].push({ label: "Stolen rounds", value: st.stolen });
    }
    const highlights: HubHighlight[] = [];
    const by = (f: (st: OddStats) => number) => [...s.players].sort((a, b) => f(s.stats[b]) - f(s.stats[a]))[0];
    const eye = by((st) => st.goodVotes);
    if (eye && s.stats[eye].goodVotes > 0)
      highlights.push({ icon: "magnifier", title: "Eagle eye", text: `Spotted the odd one out ${s.stats[eye].goodVotes} time${s.stats[eye].goodVotes > 1 ? "s" : ""}.`, playerIds: [eye] });
    const sneaky = by((st) => st.survived * 2 + st.stolen);
    if (sneaky && s.stats[sneaky].survived + s.stats[sneaky].stolen > 0)
      highlights.push({ icon: "enigma", title: "Smooth operator", text: `Got away ${s.stats[sneaky].survived}×, stole ${s.stats[sneaky].stolen}×.`, playerIds: [sneaky] });
    const sus = by((st) => st.suspected);
    if (sus && s.stats[sus].suspected > 1)
      highlights.push({ icon: "pointing", title: "Looks guilty", text: `${s.stats[sus].suspected} votes while totally innocent.`, playerIds: [sus] });
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

  publicState(s): OddPublic {
    const r = s.round;
    const result = s.phase === "result";
    const last = s.phase === "lastchance";
    return {
      phase: s.phase,
      phaseStartedAt: s.phaseStartedAt,
      phaseEndsAt: s.phaseEndsAt,
      players: s.players,
      totalRounds: s.schedule.length,
      laps: ODDWORD.laps,
      round: r
        ? {
            index: r.index,
            order: r.order,
            turn: r.turn,
            turnPlayerId: s.phase === "clue" ? oddTurnPlayer(r) : null,
            clues: r.clues,
            voted: Object.keys(r.votes),
            votes: result || last ? r.votes : null,
            accusedId: result || last ? r.accusedId : null,
            caught: result || last ? r.caught : null,
            oddId: result || last ? r.oddId : null,
            crowdWord: result ? r.crowdWord : null,
            oddWord: result ? r.oddWord : null,
            guess: result ? r.guess : null,
            stolen: result && r.stolen,
            points: result ? r.points : null,
            skipped: r.skipped,
          }
        : null,
      scores: s.scores,
    };
  },

  privateState(s, pid): OddPrivate {
    const r = s.round;
    if (!r || !pid || !s.players.includes(pid)) return { word: null, myVote: null };
    return { word: wordOf(r, pid), myVote: r.votes[pid] ?? null };
  },

  bot(s, bot, ctx) {
    const r = s.round;
    if (!r) return [];
    if (s.phase === "clue" && oddTurnPlayer(r) === bot) {
      const mine = wordOf(r, bot);
      const used = new Set(r.clues.map((c) => (c.text ? wordKey(c.text) : "")));
      const pool = ctx.content.hub.spygridWords.filter((w) => !crewClueProblem(w, mine) && !used.has(wordKey(w)));
      return [{ type: "clue", text: (pickRandom(ctx.rng, pool) ?? "thing").toLowerCase() }];
    }
    if (s.phase === "vote" && r.votes[bot] === undefined) {
      const target = pickRandom(
        ctx.rng,
        s.players.filter((p) => p !== bot),
      );
      return target ? [{ type: "vote", playerId: target }] : [];
    }
    if (s.phase === "lastchance" && r.oddId === bot)
      return [{ type: "guess", text: ctx.rng() < 0.3 ? r.crowdWord : (pickRandom(ctx.rng, ctx.content.hub.spygridWords) ?? "thing") }];
    return [];
  },
};
