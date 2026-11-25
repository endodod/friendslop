import { z } from "zod";
import { fail } from "../../engine/errors";
import type { PlayerId } from "../../engine/types";
import type { BluffPrompt } from "../../content/schemas";
import { shuffle } from "../../rng";
import { cleanText, goneLong, normalizeAnswer, styleAnswer, pickRandom, present, hubRanking, setPhase } from "../helpers";
import type { HubCtx, HubGameDefinition, HubHighlight, HubPhaseState, HubStatLine } from "../types";

/**
 * Bluff Club: each round is about one player (the spotlight). They write the real answer, everyone
 * else writes a fake in their style. Then everyone else picks the answer they think is real.
 */
export const BLUFF = {
  writeMs: 75_000,
  voteMs: 40_000,
  /** Reveal: a base plus a beat per answer (the client reveals them one by one). */
  revealBaseMs: 5_000,
  revealPerEntryMs: 2_200,
  answerMaxLength: 60,
  /** House lies are added until there are at least this many answers. */
  minEntries: 4,
  maxEntries: 9,
  points: { truth: 3, fooled: 2, spotlight: 1, mindReader: 3, laugh: 1 },
};

export interface BluffEntry {
  id: string;
  text: string;
  /** Players who wrote it (several if they wrote the same fake). Empty for the truth and house lies. */
  authors: PlayerId[];
  truth: boolean;
  house: boolean;
}

export interface BluffRound {
  index: number;
  targetId: PlayerId;
  promptId: string;
  prompt: string;
  truth: string | null;
  fakes: Record<PlayerId, string>;
  /** Built when voting starts. */
  entries: BluffEntry[];
  /** Players who typed the real answer as their fake. They don't vote this round. */
  mindReaders: PlayerId[];
  votes: Record<PlayerId, string>;
  laughs: Record<PlayerId, string>;
  points: Record<PlayerId, number> | null;
  skipped?: boolean;
}

export interface BluffStats {
  truthsFound: number;
  votes: number;
  fooled: number;
  timesFooled: number;
  laughs: number;
  mindReads: number;
  /** As the spotlight: friends who found your answer. */
  knownBy: number;
}

export interface BluffState extends HubPhaseState {
  phase: "write" | "vote" | "reveal" | "over";
  players: PlayerId[];
  schedule: { targetId: PlayerId; prompt: BluffPrompt }[];
  round: BluffRound | null;
  history: BluffRound[];
  scores: Record<PlayerId, number>;
  stats: Record<PlayerId, BluffStats>;
}

export const BluffActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("write"), text: z.string().min(1).max(120) }),
  z.object({ type: z.literal("vote"), entryId: z.string().max(16) }),
  /** Optional 😂 for the funniest fake (null takes it back). */
  z.object({ type: z.literal("laugh"), entryId: z.string().max(16).nullable() }),
]);
export type BluffAction = z.infer<typeof BluffActionSchema>;

function emptyStats(): BluffStats {
  return { truthsFound: 0, votes: 0, fooled: 0, timesFooled: 0, laughs: 0, mindReads: 0, knownBy: 0 };
}

/** Who writes a fake this round. */
function writers(s: BluffState): PlayerId[] {
  return s.round ? s.players.filter((p) => p !== s.round!.targetId) : [];
}

/** Who picks an answer this round. */
export function voters(s: Pick<BluffState, "players" | "round">): PlayerId[] {
  const r = s.round;
  return r ? s.players.filter((p) => p !== r.targetId && !r.mindReaders.includes(p)) : [];
}

function startRound(s: BluffState, ctx: HubCtx) {
  const index = s.history.length;
  const next = s.schedule[index];
  if (!next) return setPhase(s, "over", null, ctx);
  if (!s.players.includes(next.targetId)) {
    s.schedule.splice(index, 1);
    return startRound(s, ctx);
  }
  s.round = {
    index,
    targetId: next.targetId,
    promptId: next.prompt.id,
    prompt: next.prompt.prompt.replaceAll("{target}", ctx.name(next.targetId)),
    truth: null,
    fakes: {},
    entries: [],
    mindReaders: [],
    votes: {},
    laughs: {},
    points: null,
  };
  setPhase(s, "write", BLUFF.writeMs, ctx);
}

function maybeEndWriting(s: BluffState, ctx: HubCtx) {
  const r = s.round;
  if (s.phase !== "write" || !r) return;
  const targetDone = r.truth !== null || !present(ctx, r.targetId);
  const fakesDone = writers(s).every((p) => r.fakes[p] !== undefined || !present(ctx, p));
  if (targetDone && fakesDone) startVoting(s, ctx);
}

function startVoting(s: BluffState, ctx: HubCtx) {
  const r = s.round!;
  if (r.truth === null) return skipRound(s, ctx, `${ctx.name(r.targetId)} didn't write an answer: next round.`);
  const truthKey = normalizeAnswer(r.truth);
  const entries: BluffEntry[] = [{ id: "", text: r.truth, authors: [], truth: true, house: false }];
  const byKey = new Map<string, BluffEntry>([[truthKey, entries[0]]]);
  for (const [pid, text] of Object.entries(r.fakes)) {
    if (!s.players.includes(pid)) continue;
    const key = normalizeAnswer(text);
    if (key === truthKey) {
      r.mindReaders.push(pid);
      continue;
    }
    const same = byKey.get(key);
    if (same && !same.truth) same.authors.push(pid);
    else {
      const e: BluffEntry = { id: "", text, authors: [pid], truth: false, house: false };
      byKey.set(key, e);
      entries.push(e);
    }
  }
  const prompt = s.schedule[r.index]?.prompt;
  for (const d of shuffle(ctx.rng, prompt?.decoys ?? [])) {
    if (entries.length >= BLUFF.minEntries) break;
    const key = normalizeAnswer(d);
    if (byKey.has(key)) continue;
    const e: BluffEntry = { id: "", text: styleAnswer(d), authors: [], truth: false, house: true };
    byKey.set(key, e);
    entries.push(e);
  }
  // Too many players for the screen: keep the truth and as many fakes as fit.
  const kept = [entries[0], ...shuffle(ctx.rng, entries.slice(1)).slice(0, BLUFF.maxEntries - 1)];
  r.entries = shuffle(ctx.rng, kept).map((e, i) => ({ ...e, id: `e${i}` }));
  if (r.mindReaders.length) ctx.emit({ type: "sfx", id: "perfect", playerIds: r.mindReaders });
  ctx.emit({ type: "sfx", id: "reveal" });
  setPhase(s, "vote", BLUFF.voteMs, ctx);
}

function maybeEndVoting(s: BluffState, ctx: HubCtx) {
  const r = s.round;
  if (s.phase !== "vote" || !r) return;
  if (voters(s).every((p) => r.votes[p] !== undefined || !present(ctx, p))) reveal(s, ctx);
}

function add(s: BluffState, points: Record<PlayerId, number>, pid: PlayerId, n: number) {
  if (!s.players.includes(pid)) return;
  points[pid] = (points[pid] ?? 0) + n;
}

function reveal(s: BluffState, ctx: HubCtx) {
  const r = s.round!;
  const P = BLUFF.points;
  const points: Record<PlayerId, number> = {};
  for (const [pid, entryId] of Object.entries(r.votes)) {
    const e = r.entries.find((x) => x.id === entryId);
    if (!e || !s.players.includes(pid)) continue;
    s.stats[pid].votes++;
    if (e.truth) {
      add(s, points, pid, P.truth);
      add(s, points, r.targetId, P.spotlight);
      s.stats[pid].truthsFound++;
      s.stats[r.targetId].knownBy++;
    } else {
      s.stats[pid].timesFooled++;
      for (const a of e.authors) {
        add(s, points, a, P.fooled);
        if (s.stats[a]) s.stats[a].fooled++;
      }
    }
  }
  for (const pid of r.mindReaders) {
    add(s, points, pid, P.mindReader);
    s.stats[pid].mindReads++;
  }
  for (const [pid, entryId] of Object.entries(r.laughs)) {
    const e = r.entries.find((x) => x.id === entryId);
    if (!e || e.truth || !s.players.includes(pid)) continue;
    for (const a of e.authors) {
      if (a === pid) continue;
      add(s, points, a, P.laugh);
      if (s.stats[a]) s.stats[a].laughs++;
    }
  }
  for (const [p, n] of Object.entries(points)) s.scores[p] = (s.scores[p] ?? 0) + n;
  r.points = points;
  ctx.emit({ type: "sfx", id: "drumroll" });
  setPhase(s, "reveal", BLUFF.revealBaseMs + r.entries.length * BLUFF.revealPerEntryMs, ctx);
}

function nextRound(s: BluffState, ctx: HubCtx) {
  if (s.round) s.history.push(s.round);
  s.round = null;
  startRound(s, ctx);
}

function skipRound(s: BluffState, ctx: HubCtx, why: string) {
  if (s.round) {
    s.round.skipped = true;
    s.round.points = {};
  }
  ctx.emit({ type: "toast", text: why });
  nextRound(s, ctx);
}

export interface BluffPublic {
  phase: BluffState["phase"];
  phaseStartedAt: number;
  phaseEndsAt: number | null;
  players: PlayerId[];
  totalRounds: number;
  round:
    | (Omit<BluffRound, "truth" | "fakes" | "entries" | "votes" | "laughs"> & {
        /** Who has written / voted (not what). */
        written: PlayerId[];
        voted: PlayerId[];
        /** Answers to pick from (authors and the truth hidden until the reveal). */
        entries: { id: string; text: string; authors: PlayerId[] | null; truth: boolean | null; house: boolean | null }[];
        votes: Record<PlayerId, string> | null;
        laughs: Record<PlayerId, string> | null;
      })
    | null;
  history: BluffPublicRound[];
  scores: Record<PlayerId, number>;
}

export type BluffPublicRound = Pick<BluffRound, "index" | "targetId" | "prompt" | "truth" | "skipped" | "points">;

export interface BluffPrivate {
  /** What I wrote this round (truth or fake). */
  mine: string | null;
  /** Entry id of my own fake (can't vote for it). */
  myEntryId: string | null;
  myVote: string | null;
  myLaugh: string | null;
  /** I typed the real answer. */
  mindReader: boolean;
}

export const bluff: HubGameDefinition<BluffState, BluffAction> = {
  id: "bluff",
  actionSchema: BluffActionSchema,

  init(players, ctx) {
    const each = ctx.settings.hub?.bluff?.roundsEach ?? 1;
    const family = !!ctx.settings.familyFriendly;
    const pool = shuffle(
      ctx.rng,
      ctx.content.hub.bluffPrompts.filter((p) => !family || !p.spicy),
    );
    if (!pool.length) fail("INVALID_INPUT", "Bluff Club has no prompts.");
    const targets: PlayerId[] = [];
    for (let i = 0; i < each; i++) targets.push(...shuffle(ctx.rng, players));
    // Never the same player twice in a row (when rounds wrap around).
    for (let i = 1; i < targets.length; i++)
      if (targets[i] === targets[i - 1]) {
        const j = targets.findIndex((t, k) => k > i && t !== targets[i]);
        if (j > 0) [targets[i], targets[j]] = [targets[j], targets[i]];
      }
    return {
      phase: "write",
      phaseStartedAt: ctx.now,
      phaseEndsAt: null,
      players: [...players],
      schedule: targets.map((targetId, i) => ({ targetId, prompt: pool[i % pool.length] })),
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
      case "write": {
        if (s.phase !== "write") fail("WRONG_PHASE", "Writing time is over.");
        const text = styleAnswer(cleanText(a.text, BLUFF.answerMaxLength));
        if (!text) fail("INVALID_INPUT", "Write something first.");
        if (pid === r.targetId) r.truth = text;
        else r.fakes[pid] = text;
        ctx.emit({ type: "answerLocked", playerId: pid });
        return maybeEndWriting(s, ctx);
      }
      case "vote": {
        if (s.phase !== "vote") fail("WRONG_PHASE", "You can't vote right now.");
        if (!voters(s).includes(pid)) fail("INVALID_INPUT", pid === r.targetId ? "It's your answer: sit back and watch!" : "You already know the truth!");
        if (r.votes[pid] !== undefined) fail("INVALID_INPUT", "You already picked.");
        const e = r.entries.find((x) => x.id === a.entryId);
        if (!e) fail("INVALID_INPUT", "Unknown answer.");
        if (e.authors.includes(pid)) fail("INVALID_INPUT", "That's your own fake!");
        r.votes[pid] = e.id;
        ctx.emit({ type: "answerLocked", playerId: pid });
        return maybeEndVoting(s, ctx);
      }
      case "laugh": {
        if (s.phase !== "vote") fail("WRONG_PHASE", "You can't do that right now.");
        if (a.entryId === null) {
          delete r.laughs[pid];
          return;
        }
        const e = r.entries.find((x) => x.id === a.entryId);
        if (!e) fail("INVALID_INPUT", "Unknown answer.");
        if (e.authors.includes(pid)) fail("INVALID_INPUT", "No laughing at your own joke!");
        r.laughs[pid] = e.id;
        return;
      }
    }
  },

  timeout(s, ctx) {
    switch (s.phase) {
      case "write":
        return startVoting(s, ctx);
      case "vote":
        return reveal(s, ctx);
      case "reveal":
        return nextRound(s, ctx);
      case "over":
        return;
    }
  },

  stalled(s, ctx) {
    const r = s.round;
    if (!r) return false;
    let waiting: PlayerId[] = [];
    if (s.phase === "write") waiting = [...(r.truth === null ? [r.targetId] : []), ...writers(s).filter((p) => r.fakes[p] === undefined)];
    if (s.phase === "vote") waiting = voters(s).filter((p) => r.votes[p] === undefined);
    return waiting.length > 0 && waiting.every((p) => goneLong(ctx, p));
  },

  autoplay(s, ctx) {
    if (s.phase === "write") startVoting(s, ctx);
    else if (s.phase === "vote") reveal(s, ctx);
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
    const done = s.history.length + (s.round ? 1 : 0);
    s.schedule = [...s.schedule.slice(0, done), ...s.schedule.slice(done).filter((x) => x.targetId !== pid)];
    if (s.players.length < 2) {
      if (s.round) s.history.push(s.round);
      s.round = null;
      return setPhase(s, "over", null, ctx);
    }
    const r = s.round;
    if (!r) return;
    if (r.targetId === pid && s.phase !== "reveal") return skipRound(s, ctx, "The round was about a player who left: next round.");
    delete r.fakes[pid];
    delete r.votes[pid];
    delete r.laughs[pid];
    for (const e of r.entries) e.authors = e.authors.filter((a) => a !== pid);
    maybeEndWriting(s, ctx);
    maybeEndVoting(s, ctx);
  },

  addPlayer(s, pid, ctx) {
    if (s.players.includes(pid)) return;
    s.players.push(pid);
    s.scores[pid] = 0;
    s.stats[pid] = emptyStats();
    // Their spotlight rounds go at the end, with prompts nobody had yet.
    const each = ctx.settings.hub?.bluff?.roundsEach ?? 1;
    const family = !!ctx.settings.familyFriendly;
    const used = new Set(s.schedule.map((x) => x.prompt.id));
    const fresh = shuffle(
      ctx.rng,
      ctx.content.hub.bluffPrompts.filter((p) => (!family || !p.spicy) && !used.has(p.id)),
    );
    const pool = fresh.length ? fresh : ctx.content.hub.bluffPrompts;
    for (let i = 0; i < each && pool.length; i++) s.schedule.push({ targetId: pid, prompt: pool[i % pool.length] });
  },

  connectionChanged(s, ctx) {
    maybeEndWriting(s, ctx);
    maybeEndVoting(s, ctx);
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
        { label: "Truths found", value: `${st.truthsFound}/${st.votes}` },
        { label: "Friends fooled", value: st.fooled },
        { label: "😂 received", value: st.laughs },
        { label: "Friends who knew you", value: st.knownBy },
      ];
      if (st.mindReads) stats[p].push({ label: "Mind reads", value: st.mindReads });
    }
    const highlights: HubHighlight[] = [];
    const best = (key: keyof BluffStats) => [...s.players].sort((a, b) => s.stats[b][key] - s.stats[a][key])[0];
    const liar = best("fooled");
    if (liar && s.stats[liar].fooled > 0)
      highlights.push({ icon: "enigma", title: "Master bluffer", text: `Fooled ${s.stats[liar].fooled} time${s.stats[liar].fooled > 1 ? "s" : ""}.`, playerIds: [liar] });
    const det = best("truthsFound");
    if (det && s.stats[det].truthsFound > 0)
      highlights.push({ icon: "magnifier", title: "Lie detector", text: `Found the truth ${s.stats[det].truthsFound} time${s.stats[det].truthsFound > 1 ? "s" : ""}.`, playerIds: [det] });
    const funny = best("laughs");
    if (funny && s.stats[funny].laughs > 0)
      highlights.push({ icon: "party", title: "Class clown", text: `${s.stats[funny].laughs} 😂 for their fakes.`, playerIds: [funny] });
    const open = best("knownBy");
    if (open && s.stats[open].knownBy > 0)
      highlights.push({ icon: "friends", title: "Open book", text: `Friends found their real answer ${s.stats[open].knownBy} time${s.stats[open].knownBy > 1 ? "s" : ""}.`, playerIds: [open] });
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

  publicState(s): BluffPublic {
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
            targetId: r.targetId,
            promptId: r.promptId,
            prompt: r.prompt,
            mindReaders: r.mindReaders,
            points: r.points,
            skipped: r.skipped,
            written: [...(r.truth !== null ? [r.targetId] : []), ...Object.keys(r.fakes)],
            voted: Object.keys(r.votes),
            entries: r.entries.map((e) => ({
              id: e.id,
              text: e.text,
              authors: revealed ? e.authors : null,
              truth: revealed ? e.truth : null,
              house: revealed ? e.house : null,
            })),
            votes: revealed ? r.votes : null,
            laughs: revealed ? r.laughs : null,
          }
        : null,
      history: s.history.map((h) => ({ index: h.index, targetId: h.targetId, prompt: h.prompt, truth: h.truth, skipped: h.skipped, points: h.points })),
      scores: s.scores,
    };
  },

  privateState(s, pid): BluffPrivate {
    const r = s.round;
    if (!r || !pid) return { mine: null, myEntryId: null, myVote: null, myLaugh: null, mindReader: false };
    const mine = pid === r.targetId ? r.truth : (r.fakes[pid] ?? null);
    return {
      mine,
      myEntryId: r.entries.find((e) => e.authors.includes(pid))?.id ?? null,
      myVote: r.votes[pid] ?? null,
      myLaugh: r.laughs[pid] ?? null,
      mindReader: r.mindReaders.includes(pid),
    };
  },

  bot(s, bot, ctx) {
    const r = s.round;
    if (!r) return [];
    if (s.phase === "write") {
      const mine = bot === r.targetId ? r.truth : r.fakes[bot];
      if (mine !== undefined && mine !== null) return [];
      const decoys = s.schedule[r.index]?.prompt.decoys ?? [];
      const text = pickRandom(ctx.rng, decoys) ?? "Beep boop";
      return [{ type: "write", text: ctx.rng() < 0.5 ? text : `${text}!` }];
    }
    if (s.phase === "vote" && voters(s).includes(bot) && r.votes[bot] === undefined) {
      const options = r.entries.filter((e) => !e.authors.includes(bot));
      const choice = pickRandom(ctx.rng, options);
      if (!choice) return [];
      const out: BluffAction[] = [{ type: "vote", entryId: choice.id }];
      const funny = pickRandom(ctx.rng, options.filter((e) => !e.truth));
      if (funny && ctx.rng() < 0.4) out.unshift({ type: "laugh", entryId: funny.id });
      return out;
    }
    return [];
  },
};
