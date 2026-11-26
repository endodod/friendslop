import { z } from "zod";
import { fail } from "../../engine/errors";
import type { PlayerId } from "../../engine/types";
import { shuffle } from "../../rng";
import { goneLong, present, setPhase } from "../helpers";
import type { HubCtx, HubGameDefinition, HubHighlight, HubPlacement, HubPhaseState, HubStatLine } from "../types";

/**
 * Count Up (co-op, real-time): every level, everyone gets secret cards from 1 to 100 (level 1: one
 * card each, level 2: two…). Without talking about numbers, the group plays ALL cards in rising
 * order: anyone may play their lowest card at any moment. Out of order costs a life.
 */
export const COUNTUP = {
  maxCard: 100,
  /** "Get ready" before each level. */
  readyMs: 4_000,
  /** Pause after a mistake or a sync, so everyone can see what happened. */
  oopsMs: 3_500,
  levelClearMs: 4_000,
  /** Nobody played for this long: the crew loses (else waiting out every card would always win). */
  idleMs: 60_000,
  /** Clients warn this long before the idle loss. */
  idleWarnMs: 10_000,
  maxLives: 5,
  maxSyncs: 3,
  /** Rewards for clearing a level (by level number). */
  lifeAfter: [3, 6, 9],
  syncAfter: [2, 5, 8],
};

export interface CountMistake {
  /** Who played too early, and what. */
  by: PlayerId;
  card: number;
  /** Lower cards still in hands: discarded. */
  discarded: { playerId: PlayerId; cards: number[] }[];
}

export interface CountSync {
  discarded: { playerId: PlayerId; cards: number[] }[];
}

export interface CountStats {
  played: number;
  /** Played a card while someone held a lower one. */
  tooEarly: number;
  /** Was still holding a lower card when someone else played. */
  tooLate: number;
  syncs: number;
}

export interface CountState extends HubPhaseState {
  phase: "ready" | "play" | "oops" | "clear" | "over";
  players: PlayerId[];
  level: number;
  totalLevels: number;
  lives: number;
  syncs: number;
  hands: Record<PlayerId, number[]>;
  /** Cards played this level, in order. */
  pile: { playerId: PlayerId; card: number }[];
  /** Players asking for a sync (everyone holding cards must agree). */
  raised: PlayerId[];
  lastPlayAt: number;
  mistake: CountMistake | null;
  sync: CountSync | null;
  /** Reward of the level just cleared. */
  reward: { life: boolean; sync: boolean } | null;
  won: boolean | null;
  /** Why the game was lost. */
  lostBy?: "lives" | "idle";
  stats: Record<PlayerId, CountStats>;
  mistakes: number;
}

export const CountActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("play") }),
  z.object({ type: z.literal("raise"), on: z.boolean() }),
]);
export type CountAction = z.infer<typeof CountActionSchema>;

function emptyStats(): CountStats {
  return { played: 0, tooEarly: 0, tooLate: 0, syncs: 0 };
}

/** Levels a game can have: never more cards than the deck holds. */
export function countLevels(wanted: number, players: number): number {
  return Math.max(1, Math.min(wanted, Math.floor(COUNTUP.maxCard / Math.max(1, players))));
}

function holding(s: CountState): PlayerId[] {
  return s.players.filter((p) => (s.hands[p]?.length ?? 0) > 0);
}

function deal(s: CountState, ctx: HubCtx) {
  const deck = shuffle(
    ctx.rng,
    Array.from({ length: COUNTUP.maxCard }, (_, i) => i + 1),
  );
  s.hands = {};
  const each = Math.min(s.level, Math.floor(COUNTUP.maxCard / Math.max(1, s.players.length)));
  for (const p of s.players) s.hands[p] = deck.splice(0, each).sort((a, b) => a - b);
  s.pile = [];
  s.raised = [];
  s.mistake = null;
  s.sync = null;
  s.reward = null;
  ctx.emit({ type: "sfx", id: "whoosh" });
  setPhase(s, "ready", COUNTUP.readyMs, ctx);
}

function startPlay(s: CountState, ctx: HubCtx) {
  s.lastPlayAt = ctx.now;
  s.mistake = null;
  s.sync = null;
  ctx.emit({ type: "sfx", id: "go" });
  setPhase(s, "play", COUNTUP.idleMs, ctx);
}

/** Everything played: next level (or the win). */
function maybeClear(s: CountState, ctx: HubCtx): boolean {
  if (holding(s).length > 0) return false;
  const life = COUNTUP.lifeAfter.includes(s.level) && s.lives < COUNTUP.maxLives;
  const sync = COUNTUP.syncAfter.includes(s.level) && s.syncs < COUNTUP.maxSyncs;
  if (life) s.lives++;
  if (sync) s.syncs++;
  s.reward = { life, sync };
  s.raised = [];
  ctx.emit({ type: "sfx", id: "fanfare" });
  if (s.level >= s.totalLevels) {
    s.won = true;
    setPhase(s, "over", null, ctx);
  } else setPhase(s, "clear", COUNTUP.levelClearMs, ctx);
  return true;
}

function playCard(s: CountState, pid: PlayerId, ctx: HubCtx) {
  const hand = s.hands[pid] ?? [];
  const card = hand.shift()!;
  s.pile.push({ playerId: pid, card });
  s.lastPlayAt = ctx.now;
  s.stats[pid].played++;
  s.phaseEndsAt = ctx.now + COUNTUP.idleMs;
  // A card played changes the situation: hands down.
  s.raised = [];
  const discarded: CountMistake["discarded"] = [];
  for (const p of s.players) {
    const lower = (s.hands[p] ?? []).filter((c) => c < card);
    if (!lower.length) continue;
    s.hands[p] = s.hands[p].filter((c) => c > card);
    discarded.push({ playerId: p, cards: lower });
    s.stats[p].tooLate++;
  }
  if (!discarded.length) {
    ctx.emit({ type: "sfx", id: "pop" });
    maybeClear(s, ctx);
    return;
  }
  s.stats[pid].tooEarly++;
  s.mistakes++;
  s.lives--;
  s.mistake = { by: pid, card, discarded };
  ctx.emit({ type: "sfx", id: "bad" });
  if (s.lives <= 0) {
    s.won = false;
    s.lostBy = "lives";
    return setPhase(s, "over", null, ctx);
  }
  setPhase(s, "oops", COUNTUP.oopsMs, ctx);
}

function maybeSync(s: CountState, ctx: HubCtx) {
  if (s.phase !== "play" || s.syncs <= 0) return;
  const need = holding(s).filter((p) => present(ctx, p));
  if (!need.length || !need.every((p) => s.raised.includes(p))) return;
  s.syncs--;
  const discarded: CountSync["discarded"] = [];
  for (const p of holding(s)) {
    const c = s.hands[p].shift()!;
    discarded.push({ playerId: p, cards: [c] });
    if (s.stats[p]) s.stats[p].syncs++;
  }
  s.raised = [];
  s.sync = { discarded };
  ctx.emit({ type: "sfx", id: "reveal" });
  if (maybeClear(s, ctx)) return;
  setPhase(s, "oops", COUNTUP.oopsMs, ctx);
}

export interface CountPublic {
  phase: CountState["phase"];
  phaseStartedAt: number;
  phaseEndsAt: number | null;
  players: PlayerId[];
  level: number;
  totalLevels: number;
  lives: number;
  syncs: number;
  /** Cards left per player (not which). */
  handCounts: Record<PlayerId, number>;
  pile: CountState["pile"];
  raised: PlayerId[];
  mistake: CountMistake | null;
  sync: CountSync | null;
  reward: CountState["reward"];
  won: boolean | null;
  lostBy: CountState["lostBy"] | null;
  /** Every hand at the end of a lost game (to see what was left). */
  leftovers: Record<PlayerId, number[]> | null;
}

export interface CountPrivate {
  hand: number[];
}

export const countUp: HubGameDefinition<CountState, CountAction> = {
  id: "countup",
  actionSchema: CountActionSchema,

  init(players, ctx) {
    const wanted = ctx.settings.hub?.countup?.levels ?? 8;
    return {
      phase: "ready",
      phaseStartedAt: ctx.now,
      phaseEndsAt: null,
      players: [...players],
      level: 1,
      totalLevels: countLevels(wanted, players.length),
      lives: Math.min(COUNTUP.maxLives, Math.max(2, players.length)),
      syncs: 1,
      hands: {},
      pile: [],
      raised: [],
      lastPlayAt: ctx.now,
      mistake: null,
      sync: null,
      reward: null,
      won: null,
      stats: Object.fromEntries(players.map((p) => [p, emptyStats()])),
      mistakes: 0,
    };
  },

  begin(s, ctx) {
    deal(s, ctx);
  },

  action(s, pid, a, ctx) {
    if (s.phase !== "play") fail("WRONG_PHASE", s.phase === "oops" ? "Hold on, take a breath…" : "Wait for the level to start.");
    switch (a.type) {
      case "play": {
        if (!(s.hands[pid]?.length > 0)) fail("INVALID_INPUT", "You have no cards left.");
        return playCard(s, pid, ctx);
      }
      case "raise": {
        if (a.on) {
          if (s.syncs <= 0) fail("INVALID_INPUT", "No syncs left.");
          if (!(s.hands[pid]?.length > 0)) fail("INVALID_INPUT", "You have no cards left.");
          if (!s.raised.includes(pid)) s.raised.push(pid);
          return maybeSync(s, ctx);
        }
        s.raised = s.raised.filter((p) => p !== pid);
        return;
      }
    }
  },

  timeout(s, ctx) {
    switch (s.phase) {
      case "ready":
      case "oops":
        return startPlay(s, ctx);
      case "clear":
        s.level++;
        return deal(s, ctx);
      case "play":
        // A whole minute without a card: the crew fell asleep.
        s.won = false;
        s.lostBy = "idle";
        ctx.emit({ type: "sfx", id: "bad" });
        return setPhase(s, "over", null, ctx);
    }
  },

  stalled(s, ctx) {
    return s.phase === "play" && holding(s).some((p) => goneLong(ctx, p));
  },

  autoplay(s, ctx) {
    // Someone left with cards: their cards are set aside (no penalty), so the others can go on.
    for (const p of holding(s)) if (goneLong(ctx, p)) s.hands[p] = [];
    s.raised = s.raised.filter((p) => (s.hands[p]?.length ?? 0) > 0);
    ctx.emit({ type: "toast", text: "A player is away: their cards were set aside." });
    maybeClear(s, ctx);
  },

  skip(s, ctx) {
    if (s.phase === "oops" || s.phase === "ready") {
      startPlay(s, ctx);
      return true;
    }
    if (s.phase === "clear") {
      s.level++;
      deal(s, ctx);
      return true;
    }
    return false;
  },

  removePlayer(s, pid, ctx) {
    s.players = s.players.filter((p) => p !== pid);
    delete s.hands[pid];
    s.raised = s.raised.filter((p) => p !== pid);
    if (s.players.length < 1) {
      s.won = false;
      return setPhase(s, "over", null, ctx);
    }
    if (s.phase === "play") {
      if (!maybeClear(s, ctx)) maybeSync(s, ctx);
    }
  },

  addPlayer(s, pid) {
    if (s.players.includes(pid)) return;
    // Cards from the next level on; fewer levels if the deck would run out.
    s.players.push(pid);
    s.hands[pid] = [];
    s.stats[pid] = emptyStats();
    s.totalLevels = Math.max(s.level, Math.min(s.totalLevels, countLevels(s.totalLevels, s.players.length)));
  },

  connectionChanged(s, ctx) {
    maybeSync(s, ctx);
  },

  isOver(s) {
    return s.phase === "over";
  },

  results(s) {
    const cleared = s.won ? s.totalLevels : s.level - 1;
    const share = cleared / s.totalLevels;
    const rating = s.lostBy === "idle"
      ? { rating: "Fell asleep", text: `Nobody played for a minute on level ${s.level}. Waiting it out doesn't work!` }
      : s.won
      ? s.mistakes === 0
        ? { rating: "One mind", text: "Every level, not a single mistake. Spooky." }
        : { rating: "In sync!", text: `All ${s.totalLevels} levels cleared.` }
      : share >= 0.6
        ? { rating: "So close", text: `Out of lives on level ${s.level}.` }
        : share >= 0.3
          ? { rating: "Finding the rhythm", text: `Out of lives on level ${s.level}.` }
          : { rating: "Out of tune", text: `Out of lives on level ${s.level}. Count slower next time!` };
    const ranking: HubPlacement[] = s.players.map((p) => ({ playerId: p, rank: 1, score: cleared }));
    const stats: Record<PlayerId, HubStatLine[]> = {};
    for (const p of s.players) {
      const st = s.stats[p];
      stats[p] = [
        { label: "Cards played", value: st.played },
        { label: "Too early", value: st.tooEarly },
        { label: "Too late", value: st.tooLate },
        { label: "Synced away", value: st.syncs },
      ];
    }
    const highlights: HubHighlight[] = [];
    const by = (f: (st: CountStats) => number) => [...s.players].sort((a, b) => f(s.stats[b]) - f(s.stats[a]))[0];
    const steady = by((st) => st.played * 10 - (st.tooEarly + st.tooLate) * 25);
    if (steady && s.stats[steady].played > 0)
      highlights.push({ icon: "perfect", title: "Steady hand", text: `${s.stats[steady].played} cards played, ${s.stats[steady].tooEarly + s.stats[steady].tooLate} slip-ups.`, playerIds: [steady] });
    const eager = by((st) => st.tooEarly);
    if (eager && s.stats[eager].tooEarly > 0)
      highlights.push({ icon: "lightning", title: "Too eager", text: `Played too early ${s.stats[eager].tooEarly} time${s.stats[eager].tooEarly > 1 ? "s" : ""}.`, playerIds: [eager] });
    const dreamer = by((st) => st.tooLate);
    if (dreamer && s.stats[dreamer].tooLate > 0)
      highlights.push({ icon: "hourglass", title: "Daydreamer", text: `Still holding a lower card ${s.stats[dreamer].tooLate} time${s.stats[dreamer].tooLate > 1 ? "s" : ""}.`, playerIds: [dreamer] });
    return {
      ranking,
      winners: s.won ? [...s.players] : [],
      headline: rating.rating,
      scoreLabel: "levels",
      stats,
      highlights,
      coop: { score: cleared, total: s.totalLevels, rating: rating.rating, text: rating.text },
    };
  },

  publicState(s): CountPublic {
    return {
      phase: s.phase,
      phaseStartedAt: s.phaseStartedAt,
      phaseEndsAt: s.phaseEndsAt,
      players: s.players,
      level: s.level,
      totalLevels: s.totalLevels,
      lives: s.lives,
      syncs: s.syncs,
      handCounts: Object.fromEntries(s.players.map((p) => [p, s.hands[p]?.length ?? 0])),
      pile: s.pile,
      raised: s.raised,
      mistake: s.mistake,
      sync: s.sync,
      reward: s.reward,
      won: s.won,
      lostBy: s.lostBy ?? null,
      leftovers: s.phase === "over" && !s.won ? Object.fromEntries(s.players.map((p) => [p, s.hands[p] ?? []])) : null,
    };
  },

  privateState(s, pid): CountPrivate {
    return { hand: pid ? [...(s.hands[pid] ?? [])] : [] };
  },

  bot(s, bot, ctx) {
    if (s.phase !== "play") return [];
    const hand = s.hands[bot] ?? [];
    if (!hand.length) return [];
    if (s.raised.length > 0 && !s.raised.includes(bot) && s.syncs > 0) return [{ type: "raise", on: true }];
    // Wait about a beat per number between the top of the pile and my card.
    const top = s.pile[s.pile.length - 1]?.card ?? 0;
    const gap = hand[0] - top;
    const wait = gap * 160 * (0.75 + ctx.rng() * 0.5);
    return ctx.now - s.lastPlayAt >= wait ? [{ type: "play" }] : [];
  },
};
