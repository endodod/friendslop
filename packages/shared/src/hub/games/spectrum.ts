import { z } from "zod";
import { fail } from "../../engine/errors";
import type { PlayerId } from "../../engine/types";
import type { SpectrumCard } from "../../content/schemas";
import { shuffle } from "../../rng";
import { cleanText, goneLong, hubRanking, present, setPhase } from "../helpers";
import type { HubCtx, HubGameDefinition, HubHighlight, HubPhaseState, HubStatLine } from "../types";

/**
 * Spectrum: a hidden target sits on a scale between two opposites. The clue-giver sees it and gives
 * a clue; everyone else drags a dial. Points by distance; the clue-giver gets the average.
 */
export const SPECTRUM = {
  clueMs: 60_000,
  guessMs: 40_000,
  /** Reveal screen; the host can skip it. */
  revealMs: 9_000,
  clueMaxLength: 40,
  /** The scale: whole numbers from min to max. Target and guesses are on it. */
  min: 1,
  max: 10,
  /** Distance (in steps) → points, first match wins. */
  zones: [
    { within: 0, points: 4, label: "Bullseye!" },
    { within: 1, points: 2, label: "One off" },
    { within: 2, points: 1, label: "Two off" },
  ],
};

export function spectrumPoints(distance: number): number {
  return SPECTRUM.zones.find((z) => distance <= z.within)?.points ?? 0;
}

export interface SpectrumRound {
  index: number;
  giverId: PlayerId;
  card: SpectrumCard;
  /** SPECTRUM.min..max, secret until the reveal. */
  target: number;
  clue: string | null;
  guesses: Record<PlayerId, number>;
  /** Dial positions not locked in yet (count if time runs out). */
  drafts: Record<PlayerId, number>;
  /** After the reveal. */
  points: Record<PlayerId, number> | null;
  skipped?: boolean;
}

export interface SpectrumStats {
  bullseyes: number;
  guesses: number;
  guessPoints: number;
  totalDistance: number;
  cluesGiven: number;
  cluePoints: number;
}

export interface SpectrumState extends HubPhaseState {
  phase: "clue" | "guess" | "reveal" | "over";
  players: PlayerId[];
  /** Clue-giver of each round. */
  schedule: PlayerId[];
  cards: SpectrumCard[];
  round: SpectrumRound | null;
  history: SpectrumRound[];
  scores: Record<PlayerId, number>;
  stats: Record<PlayerId, SpectrumStats>;
}

export const SpectrumActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("clue"), text: z.string().min(1).max(80) }),
  z.object({ type: z.literal("guess"), value: z.number().int().min(SPECTRUM.min).max(SPECTRUM.max) }),
  z.object({ type: z.literal("draft"), value: z.number().int().min(SPECTRUM.min).max(SPECTRUM.max) }),
]);
export type SpectrumAction = z.infer<typeof SpectrumActionSchema>;

function guessersOf(s: SpectrumState): PlayerId[] {
  return s.round ? s.players.filter((p) => p !== s.round!.giverId) : [];
}

export function clueTextProblem(raw: string): string | null {
  const t = cleanText(raw, 80);
  if (!t) return "Type a clue.";
  if (t.length > SPECTRUM.clueMaxLength) return `Keep it under ${SPECTRUM.clueMaxLength} characters.`;
  if (/\d/.test(t)) return "No numbers: describe it with words!";
  return null;
}

function startRound(s: SpectrumState, ctx: HubCtx) {
  const index = s.history.length;
  if (index >= s.schedule.length) return setPhase(s, "over", null, ctx);
  // A clue-giver who has left the game gets skipped.
  const giverId = s.schedule[index];
  if (!s.players.includes(giverId)) {
    s.schedule.splice(index, 1);
    return startRound(s, ctx);
  }
  const card = s.cards[index % s.cards.length];
  const target = SPECTRUM.min + Math.floor(ctx.rng() * (SPECTRUM.max - SPECTRUM.min + 1));
  s.round = { index, giverId, card, target, clue: null, guesses: {}, drafts: {}, points: null };
  setPhase(s, "clue", SPECTRUM.clueMs, ctx);
}

function startGuessing(s: SpectrumState, ctx: HubCtx) {
  ctx.emit({ type: "sfx", id: "reveal" });
  setPhase(s, "guess", SPECTRUM.guessMs, ctx);
}

function maybeReveal(s: SpectrumState, ctx: HubCtx) {
  if (s.phase !== "guess" || !s.round) return;
  const waiting = guessersOf(s).filter((p) => s.round!.guesses[p] === undefined && present(ctx, p));
  if (waiting.length === 0) reveal(s, ctx);
}

function reveal(s: SpectrumState, ctx: HubCtx) {
  const r = s.round!;
  // Unlocked dials count.
  for (const [p, v] of Object.entries(r.drafts)) if (r.guesses[p] === undefined && s.players.includes(p)) r.guesses[p] = v;
  const points: Record<PlayerId, number> = {};
  const gs = guessersOf(s).filter((p) => r.guesses[p] !== undefined);
  for (const p of gs) {
    const d = Math.abs(r.guesses[p] - r.target);
    const pts = spectrumPoints(d);
    points[p] = pts;
    const st = s.stats[p];
    st.guesses++;
    st.guessPoints += pts;
    st.totalDistance += d;
    if (pts === SPECTRUM.zones[0].points) st.bullseyes++;
  }
  const avg = gs.length ? gs.reduce((n, p) => n + points[p], 0) / gs.length : 0;
  points[r.giverId] = Math.round(avg);
  s.stats[r.giverId].cluesGiven++;
  s.stats[r.giverId].cluePoints += points[r.giverId];
  for (const [p, v] of Object.entries(points)) s.scores[p] = (s.scores[p] ?? 0) + v;
  r.points = points;
  const best = Math.max(0, ...gs.map((p) => points[p]));
  ctx.emit({ type: "sfx", id: best >= SPECTRUM.zones[0].points ? "perfect" : best > 0 ? "match" : "miss" });
  setPhase(s, "reveal", SPECTRUM.revealMs, ctx);
}

function nextRound(s: SpectrumState, ctx: HubCtx) {
  if (s.round) s.history.push(s.round);
  s.round = null;
  startRound(s, ctx);
}

function skipRound(s: SpectrumState, ctx: HubCtx, why: string) {
  if (s.round) {
    s.round.skipped = true;
    s.round.points = {};
  }
  ctx.emit({ type: "toast", text: why });
  nextRound(s, ctx);
}

export interface SpectrumPublic {
  phase: SpectrumState["phase"];
  phaseStartedAt: number;
  phaseEndsAt: number | null;
  players: PlayerId[];
  totalRounds: number;
  round: (Omit<SpectrumRound, "target" | "guesses" | "drafts"> & { target: number | null; guesses: Record<PlayerId, number> | null; locked: PlayerId[] }) | null;
  history: SpectrumRound[];
  scores: Record<PlayerId, number>;
  nextGiver: PlayerId | null;
}

export interface SpectrumPrivate {
  /** The clue-giver sees the target. */
  target: number | null;
  myGuess: number | null;
}

export const spectrum: HubGameDefinition<SpectrumState, SpectrumAction> = {
  id: "spectrum",
  actionSchema: SpectrumActionSchema,

  init(players, ctx) {
    const each = ctx.settings.hub?.spectrum?.cluesEach ?? 2;
    const order = shuffle(ctx.rng, players);
    const schedule: PlayerId[] = [];
    for (let i = 0; i < each; i++) schedule.push(...order);
    const pool = ctx.content.hub.spectrumCards;
    if (!pool.length) fail("INVALID_INPUT", "Spectrum has no cards.");
    return {
      phase: "clue",
      phaseStartedAt: ctx.now,
      phaseEndsAt: null,
      players: [...players],
      schedule,
      cards: shuffle(ctx.rng, pool),
      round: null,
      history: [],
      scores: Object.fromEntries(players.map((p) => [p, 0])),
      stats: Object.fromEntries(players.map((p) => [p, { bullseyes: 0, guesses: 0, guessPoints: 0, totalDistance: 0, cluesGiven: 0, cluePoints: 0 }])),
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
        if (s.phase !== "clue") fail("WRONG_PHASE", "The clue is already in.");
        if (pid !== r.giverId) fail("NOT_YOUR_TURN", "It's not your turn to give the clue.");
        const problem = clueTextProblem(a.text);
        if (problem) fail("INVALID_INPUT", problem);
        r.clue = cleanText(a.text, SPECTRUM.clueMaxLength);
        return startGuessing(s, ctx);
      }
      case "guess":
      case "draft": {
        if (s.phase !== "guess") fail("WRONG_PHASE", "You can't guess right now.");
        if (pid === r.giverId) fail("INVALID_INPUT", "You gave the clue: no guessing!");
        if (!s.players.includes(pid)) fail("UNKNOWN_PLAYER", "You're not in this game.");
        if (r.guesses[pid] !== undefined) {
          if (a.type === "draft") return;
          fail("INVALID_INPUT", "You already locked in.");
        }
        const v = Math.round(a.value);
        if (a.type === "draft") {
          r.drafts[pid] = v;
          return;
        }
        r.guesses[pid] = v;
        delete r.drafts[pid];
        ctx.emit({ type: "answerLocked", playerId: pid });
        return maybeReveal(s, ctx);
      }
    }
  },

  timeout(s, ctx) {
    switch (s.phase) {
      case "clue":
        return skipRound(s, ctx, `No clue from ${ctx.name(s.round!.giverId)} in time: next round.`);
      case "guess":
        return reveal(s, ctx);
      case "reveal":
        return nextRound(s, ctx);
      case "over":
        return;
    }
  },

  stalled(s, ctx) {
    if (!s.round) return false;
    if (s.phase === "clue") return goneLong(ctx, s.round.giverId);
    if (s.phase === "guess") {
      const waiting = guessersOf(s).filter((p) => s.round!.guesses[p] === undefined);
      return waiting.length > 0 && waiting.every((p) => goneLong(ctx, p));
    }
    return false;
  },

  autoplay(s, ctx) {
    if (s.phase === "clue" && s.round) skipRound(s, ctx, `${ctx.name(s.round.giverId)} is away: their round is skipped.`);
    else maybeReveal(s, ctx);
  },

  skip(s, ctx) {
    if (s.phase === "reveal") {
      nextRound(s, ctx);
      return true;
    }
    return false;
  },

  removePlayer(s, pid, ctx) {
    s.players = s.players.filter((p) => p !== pid);
    delete s.scores[pid];
    // Drop their future rounds.
    const done = s.history.length + (s.round ? 1 : 0);
    s.schedule = [...s.schedule.slice(0, done), ...s.schedule.slice(done).filter((p) => p !== pid)];
    if (s.players.length < 2) {
      if (s.round) s.history.push(s.round);
      s.round = null;
      return setPhase(s, "over", null, ctx);
    }
    if (s.round) {
      delete s.round.guesses[pid];
      delete s.round.drafts[pid];
      if (s.round.giverId === pid && (s.phase === "clue" || s.phase === "guess")) {
        s.round.skipped = true;
        s.round.points = {};
        return nextRound(s, ctx);
      }
    }
    maybeReveal(s, ctx);
  },

  addPlayer(s, pid, ctx) {
    if (s.players.includes(pid)) return;
    s.players.push(pid);
    s.scores[pid] = 0;
    s.stats[pid] = { bullseyes: 0, guesses: 0, guessPoints: 0, totalDistance: 0, cluesGiven: 0, cluePoints: 0 };
    // Their clue rounds go at the end, as many as everyone else gets.
    const each = ctx.settings.hub?.spectrum?.cluesEach ?? 2;
    for (let i = 0; i < each; i++) s.schedule.push(pid);
  },

  connectionChanged(s, ctx) {
    maybeReveal(s, ctx);
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
        { label: "Bullseyes", value: st.bullseyes },
        { label: "Avg. steps off", value: st.guesses ? (st.totalDistance / st.guesses).toFixed(1) : "–" },
        { label: "Points as clue-giver", value: st.cluePoints },
      ];
    }
    const highlights: HubHighlight[] = [];
    const bulls = [...s.players].sort((a, b) => s.stats[b].bullseyes - s.stats[a].bullseyes)[0];
    if (bulls && s.stats[bulls].bullseyes > 0)
      highlights.push({ icon: "perfect", title: "Sharpshooter", text: `${s.stats[bulls].bullseyes} bullseye${s.stats[bulls].bullseyes > 1 ? "s" : ""}.`, playerIds: [bulls] });
    const givers = s.players.filter((p) => s.stats[p].cluesGiven > 0);
    const bestGiver = givers.sort((a, b) => s.stats[b].cluePoints / s.stats[b].cluesGiven - s.stats[a].cluePoints / s.stats[a].cluesGiven)[0];
    if (bestGiver)
      highlights.push({
        icon: "mind",
        title: "Clearest clues",
        text: `${(s.stats[bestGiver].cluePoints / s.stats[bestGiver].cluesGiven).toFixed(1)} points per clue.`,
        playerIds: [bestGiver],
      });
    let meld: { r: SpectrumRound; avg: number } | null = null;
    for (const r of s.history) {
      if (r.skipped || !r.clue) continue;
      const ds = Object.entries(r.guesses).map(([, v]) => Math.abs(v - r.target));
      if (!ds.length) continue;
      const avg = ds.reduce((a, b) => a + b, 0) / ds.length;
      if (!meld || avg < meld.avg) meld = { r, avg };
    }
    if (meld)
      highlights.push({
        icon: "friends",
        title: "Mind meld",
        text: `"${meld.r.clue}" (${meld.r.card.left} ↔ ${meld.r.card.right}): ${meld.avg === 0 ? "everyone hit the bullseye!" : `${meld.avg.toFixed(1)} steps off on average.`}`,
        playerIds: [meld.r.giverId],
      });
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

  publicState(s): SpectrumPublic {
    const r = s.round;
    const revealed = s.phase === "reveal";
    return {
      phase: s.phase,
      phaseStartedAt: s.phaseStartedAt,
      phaseEndsAt: s.phaseEndsAt,
      players: s.players,
      totalRounds: s.schedule.length,
      round: r
        ? {
            index: r.index,
            giverId: r.giverId,
            card: r.card,
            clue: r.clue,
            points: r.points,
            skipped: r.skipped,
            target: revealed ? r.target : null,
            guesses: revealed ? r.guesses : null,
            locked: Object.keys(r.guesses),
          }
        : null,
      history: s.history,
      scores: s.scores,
      nextGiver: s.schedule[s.history.length + 1] ?? null,
    };
  },

  privateState(s, pid): SpectrumPrivate {
    const r = s.round;
    return {
      target: r && pid === r.giverId ? r.target : null,
      myGuess: r && pid ? (r.guesses[pid] ?? r.drafts[pid] ?? null) : null,
    };
  },

  bot(s, bot, ctx) {
    const r = s.round;
    if (!r) return [];
    if (s.phase === "clue" && r.giverId === bot) {
      const t = r.target;
      const mid = (SPECTRUM.min + SPECTRUM.max) / 2;
      const side = t < mid ? r.card.left : r.card.right;
      const off = Math.abs(t - mid);
      const word = off >= 4 ? "extremely" : off >= 2.5 ? "fairly" : "slightly";
      return [{ type: "clue", text: off < 1 ? "Right in the middle" : `${word} ${side.toLowerCase()}`.slice(0, SPECTRUM.clueMaxLength) }];
    }
    if (s.phase === "guess" && r.giverId !== bot && r.guesses[bot] === undefined) {
      // Test bots read the clue a bit too well: a noisy guess around the target.
      const v = Math.max(SPECTRUM.min, Math.min(SPECTRUM.max, r.target + Math.round((ctx.rng() - 0.5) * 5)));
      return [{ type: "guess", value: v }];
    }
    return [];
  },
};
