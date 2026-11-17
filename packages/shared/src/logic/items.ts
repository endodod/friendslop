import { GAME_CONFIG } from "../config/game";
import type { ContentBundle, Item } from "../content/schemas";
import { emit, type Step } from "../engine/context";
import { fail } from "../engine/errors";
import type { GameState, PlayerId } from "../engine/types";
import { localize } from "../i18n";
import { shuffle, weightedPick } from "../rng";
import { transferCoins } from "./economy";
import { getBoard, prevTiles, walkBack } from "./board";

export function getItem(content: ContentBundle, id: string): Item {
  const it = content.items.find((i) => i.id === id);
  if (!it) fail("INVALID_INPUT", "Unknown item.");
  return it;
}

export function shopStock(content: ContentBundle, step: Step): string[] {
  const pool = shuffle(step.ctx.rng, content.items);
  const out: string[] = [];
  while (out.length < Math.min(GAME_CONFIG.economy.shopStockSize, content.items.length)) {
    const it = weightedPick(step.ctx.rng, pool.filter((i) => !out.includes(i.id)), (i) => i.weight)!;
    out.push(it.id);
  }
  return out;
}

/** Passive Shield: consumed when it blocks something. Returns true if blocked. */
export function tryShield(g: GameState, s: Step, playerId: PlayerId): boolean {
  const p = g.players[playerId];
  const shield = s.ctx.content.items.find((i) => i.effect === "shield");
  if (!p || !shield) return false;
  const idx = p.items.indexOf(shield.id);
  if (idx < 0) return false;
  p.items.splice(idx, 1);
  emit(s, { type: "shieldBlocked", playerId });
  emit(s, { type: "sfx", id: "shield" });
  return true;
}

export function log(g: GameState, s: Step, text: string, playerId?: PlayerId) {
  g.log.push({ at: s.ctx.now, text, playerId });
  if (g.log.length > 30) g.log.splice(0, g.log.length - 30);
}

/**
 * Apply an item used at turn start. Question-time items (peek, wide tolerance) are applied by
 * the question round. Validation of phase/ownership happens in the engine.
 */
export function applyTurnStartItem(g: GameState, s: Step, playerId: PlayerId, item: Item, targetId?: PlayerId) {
  const names = (id: PlayerId) => id;
  void names;
  const p = g.players[playerId];
  switch (item.effect) {
    case "doubleDice":
    case "customDice":
      if (g.pendingDice) fail("INVALID_INPUT", "You already changed your dice this turn.");
      g.pendingDice = { kind: item.effect === "doubleDice" ? "double" : "custom" };
      break;
    case "steal": {
      if (!targetId || targetId === playerId || !g.players[targetId]) fail("INVALID_INPUT", "Pick another player.");
      if (tryShield(g, s, targetId)) {
        log(g, s, `A shield blocked the steal!`, targetId);
        break;
      }
      const taken = transferCoins(g, s, targetId, playerId, GAME_CONFIG.items.stealCoins, "steal");
      p.stats.steals += taken > 0 ? 1 : 0;
      g.players[targetId].stats.stolenFrom += taken > 0 ? 1 : 0;
      emit(s, { type: "sfx", id: "steal" });
      break;
    }
    case "warpToStar": {
      // Land right in front of the star; your roll then (very likely) passes it.
      const board = getBoard(s.ctx.content, g.boardId);
      const before = prevTiles(board, g.starTileId).filter((t) => t !== g.starTileId);
      if (!before.length) fail("INVALID_INPUT", "Can't warp right now.");
      p.tileId = before[Math.floor(s.ctx.rng() * before.length)];
      emit(s, { type: "tokenTeleported", playerId, tileId: p.tileId });
      emit(s, { type: "sfx", id: "star" });
      break;
    }
    case "sprint": {
      if (g.diceBonus) fail("INVALID_INPUT", "You're already sprinting this turn.");
      g.diceBonus = item.params.bonus ?? 3;
      break;
    }
    case "pushBack":
    case "freeze":
    case "swapPlaces": {
      if (!targetId || targetId === playerId || !g.players[targetId]) fail("INVALID_INPUT", "Pick another player.");
      const victim = g.players[targetId];
      if (tryShield(g, s, targetId)) {
        log(g, s, "A shield blocked it!", targetId);
        break;
      }
      const board = getBoard(s.ctx.content, g.boardId);
      if (item.effect === "pushBack") {
        const path = walkBack(board, victim.tileId, item.params.steps ?? 4, s.ctx.rng);
        if (path.length) {
          victim.tileId = path[path.length - 1];
          emit(s, { type: "tokenMoved", playerId: targetId, path });
        }
        emit(s, { type: "sfx", id: "bad" });
      } else if (item.effect === "freeze") {
        if (victim.effects.frozen) fail("INVALID_INPUT", "They're already frozen.");
        victim.effects.frozen = true;
        emit(s, { type: "sfx", id: "shield" });
      } else {
        [p.tileId, victim.tileId] = [victim.tileId, p.tileId];
        emit(s, { type: "tokenTeleported", playerId, tileId: p.tileId });
        emit(s, { type: "tokenTeleported", playerId: targetId, tileId: victim.tileId });
        emit(s, { type: "sfx", id: "whoosh" });
      }
      break;
    }
    case "pickTarget":
      if (!targetId || !g.players[targetId]) fail("INVALID_INPUT", "Pick a player.");
      g.targetOverride = { by: playerId, targetId };
      break;
    default:
      fail("INVALID_INPUT", `${localize(item.name)} can't be used now.`);
  }
}
