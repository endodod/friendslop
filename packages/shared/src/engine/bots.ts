import type { z } from "zod";
import { GAME_CONFIG } from "../config/game";
import type { ContentBundle } from "../content/schemas";
import type { MinigameRegistry } from "../minigame/types";
import type { Rng } from "../rng";
import type { GameAction } from "./game";
import { starPrice, starSurcharge } from "./game";
import { itemPrice } from "../logic/economy";
import type { Answer, PlayerId, ResolvedQuestion, RoomState } from "./types";

/**
 * Test bots: seats the host can add in the lobby to try out the game flow without enough people.
 * They are driven by the server loop: every tick `botActions` says what each bot does now, and the
 * server applies those actions like any player's (errors are ignored). Bots play randomly.
 */

/** Bots wait this long into a phase before acting, so humans can follow what happens. */
export const BOT_DELAY_MS = 1500;
/** Realtime mini-games: one random input per bot this often. */
const BOT_INPUT_EVERY_MS = 700;

/** What the server remembers per room so bots don't repeat one-off moves. */
export interface BotMemory {
  /** `${minigame startedAt}:${playerId}` of bots that already submitted their mini-game result. */
  submitted: Set<string>;
  /** Last realtime mini-game input per bot (game clock). */
  lastInput: Map<PlayerId, number>;
  /** When each bot will submit in the current solo mini-game (game clock). */
  submitAt: Map<string, number>;
}

export function newBotMemory(): BotMemory {
  return { submitted: new Set(), lastInput: new Map(), submitAt: new Map() };
}

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)];

function shuffle<T>(rng: Rng, xs: readonly T[]): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** A random valid answer to a question. */
export function randomAnswer(q: Pick<ResolvedQuestion, "format" | "options" | "playerChoices" | "number">, rng: Rng): Answer | null {
  switch (q.format) {
    case "tiles":
      return q.options?.length ? { kind: "option", optionId: pick(rng, q.options).id } : null;
    case "player":
      return q.playerChoices?.length ? { kind: "player", playerId: pick(rng, q.playerChoices) } : null;
    case "ranking":
      return q.options?.length ? { kind: "order", optionIds: shuffle(rng, q.options.map((o) => o.id)) } : null;
    case "higherLower":
      return { kind: "hl", dir: rng() < 0.5 ? "higher" : "lower" };
    case "number":
    case "scale": {
      const n = q.number;
      if (!n) return null;
      const steps = Math.floor((n.max - n.min) / n.step);
      return { kind: "number", value: n.min + Math.floor(rng() * (steps + 1)) * n.step };
    }
  }
  return null;
}

/**
 * A random value that passes a zod (v4) schema: enough to make a bot "play" any mini-game
 * (badly). Returns undefined for schema types it doesn't know.
 */
export function randomFromSchema(schema: z.ZodType, rng: Rng, depth = 0): unknown {
  if (depth > 6) return undefined;
  const s = schema as any;
  const def = s._zod?.def;
  if (!def) return undefined;
  switch (def.type) {
    case "object": {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(def.shape as Record<string, z.ZodType>)) {
        const val = randomFromSchema(v, rng, depth + 1);
        if (val !== undefined) out[k] = val;
      }
      return out;
    }
    case "array": {
      const checks = (def.checks ?? []).map((c: any) => c._zod.def);
      const exact = checks.find((c: any) => c.check === "length_equals")?.length;
      const min = checks.find((c: any) => c.check === "min_length")?.minimum ?? 0;
      const max = Math.min(checks.find((c: any) => c.check === "max_length")?.maximum ?? 8, 12);
      const len = exact ?? min + Math.floor(rng() * (Math.max(min, max) - min + 1));
      return Array.from({ length: len }, () => randomFromSchema(def.element, rng, depth + 1));
    }
    case "number": {
      const lo = Number.isFinite(s.minValue) ? s.minValue : 0;
      const hi = Number.isFinite(s.maxValue) ? s.maxValue : lo + 1000;
      const v = lo + rng() * (hi - lo);
      return s.isInt ? Math.round(v) : v;
    }
    case "boolean":
      return rng() < 0.5;
    case "string":
      return "bot".slice(0, s.maxLength ?? 3);
    case "enum":
      return pick(rng, s.options);
    case "literal":
      return def.values[0];
    case "union":
      return randomFromSchema(pick(rng, def.options), rng, depth + 1);
    case "optional":
    case "nullable":
    case "default":
      return randomFromSchema(def.innerType, rng, depth + 1);
    default:
      return undefined;
  }
}

/** Everything the bots in this room want to do right now (the server applies them in order). */
export function botActions(
  room: RoomState,
  content: ContentBundle,
  registry: MinigameRegistry,
  rng: Rng,
  now: number,
  memo: BotMemory,
): GameAction[] {
  const g = room.game;
  if (!g || g.pause) return [];
  const bots = room.players.filter((p) => p.bot && g.players[p.id]).map((p) => p.id);
  if (!bots.length) return [];
  const out: GameAction[] = [];
  const settled = now - g.phaseStartedAt >= BOT_DELAY_MS;
  const active = g.order[g.activeIndex];
  const activeBot = bots.includes(active) ? active : null;
  const others = (pid: PlayerId) => g.order.filter((p) => p !== pid);

  switch (g.phase) {
    case "gameStart":
    case "minigameIntro":
      if (settled) for (const b of bots) if (!g.ready.includes(b)) out.push({ type: "ready", playerId: b });
      break;
    case "turnStart": {
      if (!settled || !activeBot) break;
      const me = g.players[activeBot];
      // Sometimes try an item first (to exercise items); if it doesn't apply, the roll still happens.
      const usable = me.items.map((id) => content.items.find((i) => i.id === id)).filter((i) => i?.useTiming === "turnStart");
      if (usable.length && rng() < 0.5) {
        const it = pick(rng, usable)!;
        out.push({ type: "useItem", playerId: activeBot, itemId: it.id, targetId: it.needsTarget ? pick(rng, others(activeBot)) : undefined });
      }
      out.push({ type: "roll", playerId: activeBot, value: 1 + Math.floor(rng() * GAME_CONFIG.dice.sides) });
      break;
    }
    case "junctionChoice":
      if (settled && activeBot && g.junction) out.push({ type: "chooseDirection", playerId: activeBot, tileId: pick(rng, g.junction.options) });
      break;
    case "shop": {
      if (!settled || !activeBot || !g.shop) break;
      const me = g.players[activeBot];
      const affordable = g.shop.stock
        .map((id) => content.items.find((i) => i.id === id)!)
        .filter((i) => i && itemPrice(i, g.order.length) <= me.coins);
      if (affordable.length && me.items.length < GAME_CONFIG.economy.maxItems && g.shop.bought.length === 0 && rng() < 0.6)
        out.push({ type: "shopBuy", playerId: activeBot, itemId: pick(rng, affordable).id });
      out.push({ type: "shopLeave", playerId: activeBot });
      break;
    }
    case "starPurchase": {
      if (!settled || !activeBot) break;
      const me = g.players[activeBot];
      out.push({ type: "starBuy", playerId: activeBot, buy: me.coins >= starPrice(content, me.items, starSurcharge(g)) });
      break;
    }
    case "tileChoice":
      if (settled && activeBot) out.push({ type: "tileChoice", playerId: activeBot, accept: rng() < 0.5 });
      break;
    case "duel":
      if (settled && g.duel && bots.includes(g.duel.challengerId))
        out.push({ type: "duelPick", playerId: g.duel.challengerId, opponentId: pick(rng, others(g.duel.challengerId)) });
      break;
    case "questionRound":
    case "minigameQuestion": {
      const q = g.question;
      if (!q || (q.stage !== "answering" && q.stage !== "targetAnswering") || now - q.stageStartedAt < BOT_DELAY_MS) break;
      for (const b of bots) {
        if (!q.participants.includes(b) || q.answers[b] || q.boosts[b]?.copy) continue;
        // Guessers answer first, the target after them.
        if ((b === q.targetId) !== (q.stage === "targetAnswering")) continue;
        const answer = randomAnswer(q.question, rng);
        if (answer) out.push({ type: "answer", playerId: b, answer });
      }
      break;
    }
    case "minigamePlaying": {
      const mg = g.minigame;
      const def = mg && registry[mg.id];
      if (!mg || !def) break;
      const players = [...mg.participants, ...(mg.state != null ? (def.extraInputPlayers?.(mg.state) ?? []) : [])];
      // Untimed mini-games have no end time: bots take 5–12 s like a quick player would.
      const total = mg.untimed ? 15_000 : Math.max(1, mg.endsAt - mg.startedAt);
      for (const b of bots.filter((p) => players.includes(p))) {
        const key = `${mg.startedAt}:${b}`;
        if (def.submitSchema && !memo.submitted.has(key)) {
          // Submit a random result somewhere between 30% and 80% of the time limit.
          if (!memo.submitAt.has(key)) memo.submitAt.set(key, mg.startedAt + total * (0.3 + rng() * 0.5));
          if (now >= memo.submitAt.get(key)!) {
            memo.submitted.add(key);
            out.push({ type: "minigameSubmit", playerId: b, submission: randomFromSchema(def.submitSchema, rng) });
          }
        }
        if (def.inputSchema && now - (memo.lastInput.get(b) ?? 0) >= BOT_INPUT_EVERY_MS && now - mg.startedAt >= 800) {
          memo.lastInput.set(b, now);
          // Question mini-games: answer the current question properly; anything else gets random input.
          const st = mg.state as { round?: { question?: ResolvedQuestion; stage?: string } | null; question?: ResolvedQuestion } | null;
          // Hot or Not: after the target answered, everyone guesses higher/lower.
          const hl = { dir: rng() < 0.5 ? "higher" : "lower" };
          if (st?.round?.stage === "guess" && def.inputSchema.safeParse(hl).success) {
            out.push({ type: "minigameInput", playerId: b, input: hl });
            continue;
          }
          const q = st?.round?.question ?? st?.question;
          const answer = q?.format ? randomAnswer(q, rng) : null;
          const asAnswer = answer && def.inputSchema.safeParse({ answer }).success ? { answer } : null;
          out.push({ type: "minigameInput", playerId: b, input: asAnswer ?? randomFromSchema(def.inputSchema, rng) });
        }
      }
      break;
    }
  }
  return out;
}
