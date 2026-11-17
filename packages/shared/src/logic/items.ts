import { GAME_CONFIG } from "../config/game";
import type { ContentBundle, Item } from "../content/schemas";
import { emit, type Step } from "../engine/context";
import { fail } from "../engine/errors";
import type { GameState, PlayerId } from "../engine/types";
import { localize } from "../i18n";
import { shuffle, weightedPick } from "../rng";
import { changeCoins, changeStars, transferCoins } from "./economy";
import { getBoard, prevTiles, walkBack } from "./board";

export function getItem(content: ContentBundle, id: string): Item {
  const it = content.items.find((i) => i.id === id);
  if (!it) fail("INVALID_INPUT", "Unknown item.");
  return it;
}

/** Items that do nothing on this map (Bank Heist without a Piggy Bank) aren't sold or handed out. */
export function availableItems(content: ContentBundle, g: Pick<GameState, "tileTypes">): Item[] {
  const hasBank = Object.values(g.tileTypes).includes("bank");
  return content.items.filter((i) => i.effect !== "bankHeist" || hasBank);
}

export function shopStock(content: ContentBundle, step: Step, g?: Pick<GameState, "tileTypes">): string[] {
  const pool = shuffle(step.ctx.rng, g ? availableItems(content, g) : content.items);
  const out: string[] = [];
  while (out.length < Math.min(GAME_CONFIG.economy.shopStockSize, pool.length)) {
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
      g.pendingDice = item.effect === "doubleDice" ? { kind: "double", count: item.params.dice ?? 2 } : { kind: "custom" };
      break;
    case "steal": {
      if (!targetId || targetId === playerId || !g.players[targetId]) fail("INVALID_INPUT", "Pick another player.");
      if (tryShield(g, s, targetId)) {
        log(g, s, `A shield blocked the steal!`, targetId);
        break;
      }
      const taken = transferCoins(g, s, targetId, playerId, item.params.amount ?? GAME_CONFIG.items.stealCoins, "steal");
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
    case "coinMagnet": {
      // Pull coins from everyone else (Shields block it for their owner).
      let total = 0;
      for (const other of Object.keys(g.players).filter((x) => x !== playerId)) {
        if (tryShield(g, s, other)) continue;
        total += transferCoins(g, s, other, playerId, item.params.amount ?? 3, "steal");
      }
      emit(s, { type: "sfx", id: "steal" });
      log(g, s, `Coin Magnet pulled ${total} coins!`, playerId);
      break;
    }
    case "stealStar": {
      if (!targetId || targetId === playerId || !g.players[targetId]) fail("INVALID_INPUT", "Pick another player.");
      if (g.players[targetId].stars < 1) fail("INVALID_INPUT", "They don't have a star to steal.");
      if (tryShield(g, s, targetId)) {
        log(g, s, "A shield saved their star!", targetId);
        break;
      }
      changeStars(g, s, targetId, -1, "stolen");
      changeStars(g, s, playerId, 1, "stolen");
      p.stats.steals++;
      g.players[targetId].stats.stolenFrom++;
      emit(s, { type: "sfx", id: "star" });
      break;
    }
    case "bankHeist": {
      if (!Object.values(g.tileTypes).includes("bank")) fail("INVALID_INPUT", "There's no Piggy Bank on this map.");
      if (g.bank <= 0) fail("INVALID_INPUT", "The Piggy Bank is empty right now.");
      const pot = g.bank;
      g.bank = 0;
      changeCoins(g, s, playerId, pot, "tile:bank");
      emit(s, { type: "sfx", id: "fanfare" });
      log(g, s, `Bank Heist! ${pot} coins grabbed from the Piggy Bank.`, playerId);
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
