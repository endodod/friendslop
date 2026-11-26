import { z } from "zod";
import { fail } from "../../engine/errors";
import type { PlayerId } from "../../engine/types";
import { shuffle } from "../../rng";
import { TEAM_INFO } from "../catalog";
import { cleanText, goneLong, pickRandom, present, setPhase } from "../helpers";
import type { HubCtx, HubGameDefinition, HubHighlight, HubPhaseState, HubResults, HubStatLine, TeamId } from "../types";

/**
 * Spy Grid: two teams, 25 words. Each team's clue-giver sees the key and gives one-word clues;
 * their teammates vote on words. A word is revealed once most of the team's guessers agree.
 */
export const SPYGRID = {
  gridSize: 25,
  /** The starting team has one more agent to find. */
  startTeamCards: 9,
  otherTeamCards: 8,
  traps: 1,
  /** Clue / guess timers per pace setting (null = no timer). */
  pace: {
    fast: { clueMs: 60_000, guessMs: 60_000 },
    normal: { clueMs: 90_000, guessMs: 100_000 },
    relaxed: { clueMs: 150_000, guessMs: 150_000 },
    off: { clueMs: null, guessMs: null },
  } as Record<string, { clueMs: number | null; guessMs: number | null }>,
  /** Pause between turns ("Owls' turn"). */
  turnEndMs: 3500,
  /** Highest clue number; 0 and "unlimited" both allow any number of guesses. */
  maxCount: 9,
  clueMaxLength: 24,
};

export type CardKind = TeamId | "neutral" | "trap";
export const UNLIMITED = -1;

export interface SpyCard {
  word: string;
  kind: CardKind;
  revealed: boolean;
  /** Team whose turn it was when this card was revealed. */
  revealedBy: TeamId | null;
}

export interface SpyClue {
  team: TeamId;
  word: string;
  /** 0..9, or UNLIMITED. */
  count: number;
  givenBy: PlayerId;
}

export interface SpyTurnLog {
  team: TeamId;
  clue: SpyClue | null;
  /** Revealed card indices in order. */
  reveals: number[];
  /** Why the turn ended. */
  ended: "neutral" | "enemy" | "trap" | "pass" | "out" | "timeout" | "noClue" | "won" | null;
}

export interface SpyStats {
  cluesGiven: number;
  /** Own agents found from this player's clues. */
  clueHits: number;
  /** Own agents found with this player's vote. */
  found: number;
  /** Bystanders / enemy agents revealed with this player's vote. */
  misses: number;
  traps: number;
}

export interface SpyState extends HubPhaseState {
  phase: "clue" | "guess" | "turnEnd" | "over";
  pace: string;
  teams: Record<PlayerId, TeamId>;
  clueGivers: Record<TeamId, PlayerId | null>;
  cards: SpyCard[];
  startTeam: TeamId;
  turn: TeamId;
  turnNumber: number;
  clue: SpyClue | null;
  /** Reveals left this turn (99 = unlimited). */
  guessesLeft: number;
  /** Current votes of the turn team's guessers: card index or "pass". */
  votes: Record<PlayerId, number | "pass">;
  log: SpyTurnLog[];
  lastReveal: { index: number; team: TeamId; voters: PlayerId[]; at: number } | null;
  winner: TeamId | null;
  winReason: "allFound" | "trap" | "forfeit" | null;
  stats: Record<PlayerId, SpyStats>;
  /** Who made the losing trap pick (voters). */
  trapVoters: PlayerId[];
}

const other = (t: TeamId): TeamId => (t === "a" ? "b" : "a");

export const SpyGridActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("clue"), word: z.string().min(1).max(40), count: z.number().int().min(-1).max(SPYGRID.maxCount) }),
  /** Vote for a card (index), or null to take your vote back. */
  z.object({ type: z.literal("vote"), index: z.number().int().min(0).max(SPYGRID.gridSize - 1).nullable() }),
  /** Vote to end the turn. */
  z.object({ type: z.literal("pass") }),
]);
export type SpyGridAction = z.infer<typeof SpyGridActionSchema>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
export function teamMembers(s: SpyState, t: TeamId): PlayerId[] {
  return Object.keys(s.teams).filter((p) => s.teams[p] === t);
}

/** Who votes for the team: everyone but the clue-giver (a lone clue-giver guesses too). */
export function guessersOf(s: SpyState, t: TeamId): PlayerId[] {
  const m = teamMembers(s, t);
  const g = m.filter((p) => p !== s.clueGivers[t]);
  return g.length ? g : m;
}

export function agentsLeft(s: Pick<SpyState, "cards">, t: TeamId): number {
  return s.cards.filter((c) => c.kind === t && !c.revealed).length;
}

/** Why a clue isn't allowed (null = fine). */
export function clueProblem(s: Pick<SpyState, "cards">, raw: string): string | null {
  const word = cleanText(raw, 40);
  if (!word) return "Type a clue.";
  if (/\s/.test(word)) return "One word only.";
  if (word.length > SPYGRID.clueMaxLength) return "That clue is too long.";
  if (!/^[\p{L}\p{N}'-]+$/u.test(word)) return "Letters and numbers only.";
  const w = word.toUpperCase();
  for (const c of s.cards) {
    if (c.revealed) continue;
    const cw = c.word.toUpperCase();
    if (cw === w) return "That word is on the grid.";
    if (w.length >= 3 && cw.length >= 3 && (cw.includes(w) || w.includes(cw))) return `Too close to "${c.word}" on the grid.`;
  }
  return null;
}

/**
 * Chat during Spy Grid: no words that are still hidden on the grid (also simple plurals), so nobody can
 * hint outside the one official clue. Returns the reason, or null when the message is fine.
 */
export function spyChatProblem(s: Pick<SpyState, "cards" | "phase">, text: string): string | null {
  if (s.phase === "over") return null;
  const hidden = new Set(s.cards.filter((c) => !c.revealed).map((c) => c.word.toUpperCase()));
  const tokens = text
    .toUpperCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^A-Z0-9]+/)
    .filter(Boolean);
  for (const t of tokens) {
    const forms = [t, t.replace(/ES$/, ""), t.replace(/S$/, ""), t.replace(/'S$/, "")];
    const hit = forms.find((f) => hidden.has(f));
    if (hit) return `No grid words in chat during Spy Grid ("${hit.toLowerCase()}" is still on the grid).`;
  }
  return null;
}

function stat(s: SpyState, pid: PlayerId): SpyStats {
  return (s.stats[pid] ??= { cluesGiven: 0, clueHits: 0, found: 0, misses: 0, traps: 0 });
}

function connectedGuessers(s: SpyState, ctx: HubCtx): PlayerId[] {
  return guessersOf(s, s.turn).filter((p) => present(ctx, p));
}

function currentLog(s: SpyState): SpyTurnLog {
  return s.log[s.log.length - 1];
}

// ---------------------------------------------------------------------------
// Flow
// ---------------------------------------------------------------------------
function startTurn(s: SpyState, team: TeamId, ctx: HubCtx) {
  s.turn = team;
  s.turnNumber++;
  s.clue = null;
  s.votes = {};
  s.guessesLeft = 0;
  s.log.push({ team, clue: null, reveals: [], ended: null });
  // A clue-giver who left (or was removed): hand the role to a teammate who's here.
  ensureClueGiver(s, team, ctx);
  setPhase(s, "clue", SPYGRID.pace[s.pace]?.clueMs ?? null, ctx);
}

function ensureClueGiver(s: SpyState, team: TeamId, ctx: HubCtx) {
  const cur = s.clueGivers[team];
  if (cur && s.teams[cur] === team && !goneLong(ctx, cur)) return;
  const members = teamMembers(s, team);
  const next = members.find((p) => p !== cur && ctx.isConnected(p) && !ctx.isBot(p)) ?? members.find((p) => p !== cur && ctx.isConnected(p));
  if (next) {
    s.clueGivers[team] = next;
    ctx.emit({ type: "toast", text: `${ctx.name(next)} is now the ${TEAM_INFO[team].name}' clue-giver.` });
  }
}

function endTurn(s: SpyState, why: SpyTurnLog["ended"], ctx: HubCtx) {
  const log = currentLog(s);
  if (log) log.ended = why;
  s.votes = {};
  if (s.winner) return finish(s, ctx);
  setPhase(s, "turnEnd", SPYGRID.turnEndMs, ctx);
}

function finish(s: SpyState, ctx: HubCtx) {
  s.votes = {};
  setPhase(s, "over", null, ctx);
  ctx.emit({ type: "sfx", id: "win" });
}

function giveClue(s: SpyState, pid: PlayerId, word: string, count: number, ctx: HubCtx) {
  const problem = clueProblem(s, word);
  if (problem) fail("INVALID_INPUT", problem);
  const clean = cleanText(word, SPYGRID.clueMaxLength).toUpperCase();
  s.clue = { team: s.turn, word: clean, count, givenBy: pid };
  s.guessesLeft = count <= 0 ? 99 : count + 1;
  currentLog(s).clue = s.clue;
  stat(s, pid).cluesGiven++;
  ctx.emit({ type: "sfx", id: "reveal" });
  setPhase(s, "guess", SPYGRID.pace[s.pace]?.guessMs ?? null, ctx);
}

/** Majority of the guessers who are here (at least one). */
function needed(s: SpyState, ctx: HubCtx): number {
  const n = Math.max(1, connectedGuessers(s, ctx).length);
  return Math.floor(n / 2) + 1;
}

function resolveVotes(s: SpyState, ctx: HubCtx) {
  if (s.phase !== "guess") return;
  const here = new Set(connectedGuessers(s, ctx));
  const tally = new Map<number | "pass", PlayerId[]>();
  for (const [pid, v] of Object.entries(s.votes)) {
    if (!here.has(pid)) continue;
    tally.set(v, [...(tally.get(v) ?? []), pid]);
  }
  const need = needed(s, ctx);
  for (const [v, voters] of tally) {
    if (voters.length < need) continue;
    if (v === "pass") return endTurn(s, "pass", ctx);
    return reveal(s, v, voters, ctx);
  }
}

function reveal(s: SpyState, index: number, voters: PlayerId[], ctx: HubCtx) {
  const card = s.cards[index];
  if (card.revealed) return;
  card.revealed = true;
  card.revealedBy = s.turn;
  s.votes = {};
  s.lastReveal = { index, team: s.turn, voters, at: ctx.now };
  currentLog(s).reveals.push(index);
  const team = s.turn;
  if (card.kind === "trap") {
    for (const v of voters) stat(s, v).traps++;
    s.trapVoters = voters;
    s.winner = other(team);
    s.winReason = "trap";
    ctx.emit({ type: "sfx", id: "bad" });
    return endTurn(s, "trap", ctx);
  }
  if (card.kind === team) {
    for (const v of voters) stat(s, v).found++;
    if (s.clue) stat(s, s.clue.givenBy).clueHits++;
    ctx.emit({ type: "sfx", id: "match" });
    if (agentsLeft(s, team) === 0) {
      s.winner = team;
      s.winReason = "allFound";
      return endTurn(s, "won", ctx);
    }
    s.guessesLeft--;
    if (s.guessesLeft <= 0) return endTurn(s, "out", ctx);
    return;
  }
  for (const v of voters) stat(s, v).misses++;
  if (card.kind !== "neutral" && agentsLeft(s, card.kind) === 0) {
    // Revealed the other team's last agent: they win.
    s.winner = card.kind;
    s.winReason = "allFound";
    ctx.emit({ type: "sfx", id: "bad" });
    return endTurn(s, "enemy", ctx);
  }
  ctx.emit({ type: "sfx", id: "miss" });
  return endTurn(s, card.kind === "neutral" ? "neutral" : "enemy", ctx);
}

// ---------------------------------------------------------------------------
// Definition
// ---------------------------------------------------------------------------
export interface SpyPublic {
  phase: SpyState["phase"];
  phaseStartedAt: number;
  phaseEndsAt: number | null;
  pace: string;
  teams: Record<PlayerId, TeamId>;
  clueGivers: Record<TeamId, PlayerId | null>;
  /** kind is only present for revealed cards (all cards once the game is over). */
  cards: { word: string; revealed: boolean; kind: CardKind | null; revealedBy: TeamId | null }[];
  startTeam: TeamId;
  turn: TeamId;
  turnNumber: number;
  clue: SpyClue | null;
  guessesLeft: number;
  votes: Record<PlayerId, number | "pass">;
  left: Record<TeamId, number>;
  log: SpyTurnLog[];
  lastReveal: SpyState["lastReveal"];
  winner: TeamId | null;
  winReason: SpyState["winReason"];
}

export interface SpyPrivate {
  /** Clue-givers only: the key. */
  key: CardKind[] | null;
}

export const spyGrid: HubGameDefinition<SpyState, SpyGridAction> = {
  id: "spygrid",
  actionSchema: SpyGridActionSchema,

  init(players, ctx, setup) {
    const pool = ctx.content.hub.spygridWords;
    if (pool.length < SPYGRID.gridSize) fail("INVALID_INPUT", "Spy Grid has no word list.");
    // No word inside another on the same grid (SNOW and SNOWMAN would block each other's clues).
    const words: string[] = [];
    for (const w of shuffle(ctx.rng, pool)) {
      if (words.length >= SPYGRID.gridSize) break;
      if (words.some((x) => x.includes(w) || w.includes(x))) continue;
      words.push(w);
    }
    if (words.length < SPYGRID.gridSize) fail("INVALID_INPUT", "Spy Grid's word list is too short.");
    const startTeam: TeamId = ctx.rng() < 0.5 ? "a" : "b";
    const kinds: CardKind[] = [
      ...Array(SPYGRID.startTeamCards).fill(startTeam),
      ...Array(SPYGRID.otherTeamCards).fill(other(startTeam)),
      ...Array(SPYGRID.traps).fill("trap"),
    ];
    while (kinds.length < SPYGRID.gridSize) kinds.push("neutral");
    const shuffled = shuffle(ctx.rng, kinds);
    const teams: Record<PlayerId, TeamId> = {};
    for (const p of players) teams[p] = setup.teams[p] ?? "a";
    return {
      phase: "clue",
      phaseStartedAt: ctx.now,
      phaseEndsAt: null,
      pace: ctx.settings.hub?.spygrid?.pace ?? "normal",
      teams,
      clueGivers: { a: setup.clueGivers.a ?? null, b: setup.clueGivers.b ?? null },
      cards: words.map((word, i) => ({ word, kind: shuffled[i], revealed: false, revealedBy: null })),
      startTeam,
      turn: startTeam,
      turnNumber: 0,
      clue: null,
      guessesLeft: 0,
      votes: {},
      log: [],
      lastReveal: null,
      winner: null,
      winReason: null,
      stats: Object.fromEntries(players.map((p) => [p, { cluesGiven: 0, clueHits: 0, found: 0, misses: 0, traps: 0 }])),
      trapVoters: [],
    };
  },

  begin(s, ctx) {
    startTurn(s, s.startTeam, ctx);
  },

  action(s, pid, a, ctx) {
    const team = s.teams[pid];
    if (!team) fail("UNKNOWN_PLAYER", "You're not on a team.");
    switch (a.type) {
      case "clue": {
        if (s.phase !== "clue") fail("WRONG_PHASE", "It's not time for a clue.");
        if (team !== s.turn || s.clueGivers[team] !== pid) fail("NOT_YOUR_TURN", "Only the clue-giver of the team whose turn it is gives the clue.");
        return giveClue(s, pid, a.word, a.count, ctx);
      }
      case "vote":
      case "pass": {
        if (s.phase !== "guess") fail("WRONG_PHASE", "Wait for the clue.");
        if (team !== s.turn || !guessersOf(s, team).includes(pid)) fail("NOT_YOUR_TURN", "It's the other team's turn.");
        if (a.type === "pass") {
          if (!currentLog(s).reveals.length) fail("INVALID_INPUT", "Guess at least one word first.");
          s.votes[pid] = "pass";
        } else if (a.index === null) delete s.votes[pid];
        else {
          if (s.cards[a.index].revealed) fail("INVALID_INPUT", "That word is already revealed.");
          s.votes[pid] = a.index;
        }
        ctx.emit({ type: "sfx", id: "click", playerIds: [pid] });
        return resolveVotes(s, ctx);
      }
    }
  },

  timeout(s, ctx) {
    switch (s.phase) {
      case "clue":
        ctx.emit({ type: "toast", text: `Time's up: no clue from the ${TEAM_INFO[s.turn].name}.` });
        return endTurn(s, "noClue", ctx);
      case "guess":
        return endTurn(s, "timeout", ctx);
      case "turnEnd":
        return startTurn(s, other(s.turn), ctx);
      case "over":
        return;
    }
  },

  stalled(s, ctx) {
    if (s.phase === "clue") {
      const g = s.clueGivers[s.turn];
      return !g || goneLong(ctx, g);
    }
    if (s.phase === "guess") {
      const gs = guessersOf(s, s.turn);
      return gs.length > 0 && gs.every((p) => goneLong(ctx, p));
    }
    return false;
  },

  autoplay(s, ctx) {
    if (s.phase === "clue") {
      const before = s.clueGivers[s.turn];
      ensureClueGiver(s, s.turn, ctx);
      // Nobody on the team can take over: their turn passes.
      if (s.clueGivers[s.turn] === before) endTurn(s, "noClue", ctx);
      else setPhase(s, "clue", SPYGRID.pace[s.pace]?.clueMs ?? null, ctx);
      return;
    }
    if (s.phase === "guess") endTurn(s, "timeout", ctx);
  },

  skip(s, ctx) {
    if (s.phase === "turnEnd") {
      startTurn(s, other(s.turn), ctx);
      return true;
    }
    if (s.phase === "guess") {
      endTurn(s, "pass", ctx);
      return true;
    }
    if (s.phase === "clue") {
      endTurn(s, "noClue", ctx);
      return true;
    }
    return false;
  },

  removePlayer(s, pid, ctx) {
    const team = s.teams[pid];
    delete s.teams[pid];
    delete s.votes[pid];
    if (!team) return;
    if (teamMembers(s, team).length === 0) {
      s.winner = other(team);
      s.winReason = "forfeit";
      return finish(s, ctx);
    }
    if (s.clueGivers[team] === pid) {
      s.clueGivers[team] = null;
      ensureClueGiver(s, team, ctx);
      if (!s.clueGivers[team]) s.clueGivers[team] = teamMembers(s, team)[0];
      if (s.phase === "clue" && s.turn === team) setPhase(s, "clue", SPYGRID.pace[s.pace]?.clueMs ?? null, ctx);
    }
    resolveVotes(s, ctx);
  },

  addPlayer(s, pid) {
    // Join the smaller team as a guesser.
    const a = teamMembers(s, "a").length;
    const b = teamMembers(s, "b").length;
    s.teams[pid] = a <= b ? "a" : "b";
    s.stats[pid] ??= { cluesGiven: 0, clueHits: 0, found: 0, misses: 0, traps: 0 };
  },

  connectionChanged(s, ctx) {
    // Fewer guessers here: the votes already cast may now be a majority.
    resolveVotes(s, ctx);
  },

  isOver(s) {
    return s.phase === "over";
  },

  results(s, ctx) {
    const winner = s.winner ?? (agentsLeft(s, "a") <= agentsLeft(s, "b") ? "a" : "b");
    const players = Object.keys(s.teams);
    const found = (t: TeamId) => s.cards.filter((c) => c.kind === t && c.revealed).length;
    const ranking = players
      .map((p) => ({ playerId: p, rank: s.teams[p] === winner ? 1 : 2, score: found(s.teams[p]) }))
      .sort((x, y) => x.rank - y.rank);
    const stats: Record<PlayerId, HubStatLine[]> = {};
    for (const p of players) {
      const st = s.stats[p] ?? { cluesGiven: 0, clueHits: 0, found: 0, misses: 0, traps: 0 };
      const lines: HubStatLine[] = [];
      if (st.cluesGiven) lines.push({ label: "Clues given", value: st.cluesGiven }, { label: "Found from clues", value: st.clueHits });
      // Clue-givers don't vote (unless they were alone on their team).
      if (!st.cluesGiven || st.found || st.misses) lines.push({ label: "Agents found", value: st.found }, { label: "Wrong picks", value: st.misses });
      if (st.traps) lines.push({ label: "Trap hit", value: "💀" });
      stats[p] = lines;
    }
    const highlights: HubHighlight[] = [];
    let best: { log: SpyTurnLog; hits: number } | null = null;
    for (const log of s.log) {
      if (!log.clue) continue;
      const hits = log.reveals.filter((i) => s.cards[i].kind === log.team).length;
      if (hits >= 2 && (!best || hits > best.hits)) best = { log, hits };
    }
    if (best?.log.clue)
      highlights.push({
        icon: "mind",
        title: "Best clue",
        text: `"${best.log.clue.word} ${best.log.clue.count === UNLIMITED ? "∞" : best.log.clue.count}" found ${best.hits} agents.`,
        playerIds: [best.log.clue.givenBy],
      });
    const sharp = players.filter((p) => (s.stats[p]?.found ?? 0) > 0).sort((a, b) => (s.stats[b].found ?? 0) - (s.stats[a].found ?? 0))[0];
    if (sharp) highlights.push({ icon: "magnifier", title: "Sharpest eye", text: `Found ${s.stats[sharp].found} agents.`, playerIds: [sharp] });
    if (s.winReason === "trap" && s.trapVoters.length)
      highlights.push({ icon: "skull", title: "Walked into the trap", text: `Picked the trap word.`, playerIds: s.trapVoters });
    const reason =
      s.winReason === "trap" ? "The other team found the trap." : s.winReason === "forfeit" ? "The other team left." : "All agents found.";
    return {
      ranking,
      winners: players.filter((p) => s.teams[p] === winner),
      headline: `${TEAM_INFO[winner].emoji} Team ${TEAM_INFO[winner].name} wins!`,
      scoreLabel: `${reason}`,
      stats,
      highlights,
      teams: (["a", "b"] as const).map((t) => ({
        id: t,
        name: TEAM_INFO[t].name,
        score: found(t),
        won: t === winner,
        players: players.filter((p) => s.teams[p] === t),
      })),
    } satisfies HubResults;
  },

  publicState(s): SpyPublic {
    const over = s.phase === "over";
    return {
      phase: s.phase,
      phaseStartedAt: s.phaseStartedAt,
      phaseEndsAt: s.phaseEndsAt,
      pace: s.pace,
      teams: s.teams,
      clueGivers: s.clueGivers,
      cards: s.cards.map((c) => ({ word: c.word, revealed: c.revealed, kind: c.revealed || over ? c.kind : null, revealedBy: c.revealedBy })),
      startTeam: s.startTeam,
      turn: s.turn,
      turnNumber: s.turnNumber,
      clue: s.clue,
      guessesLeft: s.guessesLeft,
      votes: s.votes,
      left: { a: agentsLeft(s, "a"), b: agentsLeft(s, "b") },
      log: s.log,
      lastReveal: s.lastReveal,
      winner: s.winner,
      winReason: s.winReason,
    };
  },

  privateState(s, pid): SpyPrivate {
    const isGiver = !!pid && (s.clueGivers.a === pid || s.clueGivers.b === pid);
    return { key: isGiver || s.phase === "over" ? s.cards.map((c) => c.kind) : null };
  },

  bot(s, bot, ctx) {
    const team = s.teams[bot];
    if (!team || team !== s.turn) return [];
    if (s.phase === "clue" && s.clueGivers[team] === bot) {
      const word = BOT_CLUES.find((w) => !clueProblem(s, w)) ?? "BEEP";
      return [{ type: "clue", word, count: 1 }];
    }
    if (s.phase === "guess" && guessersOf(s, team).includes(bot) && s.votes[bot] === undefined) {
      // Follow the team: vote for what most others picked; else a lucky (often right) guess.
      const counts = new Map<number | "pass", number>();
      for (const [p, v] of Object.entries(s.votes)) if (p !== bot) counts.set(v, (counts.get(v) ?? 0) + 1);
      const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      if (top) return top[0] === "pass" ? [{ type: "pass" }] : [{ type: "vote", index: top[0] }];
      if (currentLog(s).reveals.length && ctx.rng() < 0.25) return [{ type: "pass" }];
      const open = s.cards.map((c, i) => ({ c, i })).filter((x) => !x.c.revealed);
      const mine = open.filter((x) => x.c.kind === team);
      const choice = (ctx.rng() < 0.6 && mine.length ? pickRandom(ctx.rng, mine) : pickRandom(ctx.rng, open.filter((x) => x.c.kind !== "trap"))) ?? open[0];
      return choice ? [{ type: "vote", index: choice.i }] : [];
    }
    return [];
  },
};

const BOT_CLUES = ["BEEP", "CIRCUIT", "ROBOT", "GADGET", "SIGNAL", "PIXEL", "BINARY", "SENSOR", "GEARS", "VOLTAGE"];
