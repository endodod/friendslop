import { GAME_CONFIG } from "../config/game";
import type { ContentBundle, Item } from "../content/schemas";
import { emit, type Step } from "../engine/context";
import { fail } from "../engine/errors";
import type { GameLogEntry, GameState, PlayerId } from "../engine/types";
import { localize } from "../i18n";
import { shuffle, weightedPick } from "../rng";
import { changeCoins, changeStars, transferCoins } from "./economy";
import { getBoard, prevTiles, starCandidates, walkBack } from "./board";

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

/**
 * Chance weight for the free item on Item tiles: the stronger (pricier, for this game) the item,
 * the rarer. Items at or below the base price drop at their normal weight; e.g. a 12-coin item
 * drops ~35% as often, Star Warp (35) ~7%, Star Thief ~1%.
 */
export function itemDropWeight(item: Item, playerCount: number): number {
  const D = GAME_CONFIG.economy.itemDrop;
  const price = item.price + item.pricePerOpponent * Math.max(0, playerCount - 1);
  return item.weight * Math.pow(D.basePrice / Math.max(D.basePrice, price), D.falloff);
}

/** Items that let a player who is behind get to a star: at least one is always in the shop. */
export const COMEBACK_EFFECTS = ["stealStar", "swapPlaces", "warpToStar"];

export function shopStock(content: ContentBundle, step: Step, g?: Pick<GameState, "tileTypes">): string[] {
  const pool = shuffle(step.ctx.rng, g ? availableItems(content, g) : content.items);
  const out: string[] = [];
  while (out.length < Math.min(GAME_CONFIG.economy.shopStockSize, pool.length)) {
    const it = weightedPick(step.ctx.rng, pool.filter((i) => !out.includes(i.id)), (i) => i.weight)!;
    out.push(it.id);
  }
  // Guarantee a comeback item (Star Thief, Swap Places or Star Warp) so unlucky players always have a way to a star.
  const comeback = pool.filter((i) => COMEBACK_EFFECTS.includes(i.effect));
  if (comeback.length && !out.some((id) => comeback.some((c) => c.id === id))) {
    const pick = weightedPick(step.ctx.rng, comeback, (i) => Math.max(i.weight, 0.01))!;
    out[Math.floor(step.ctx.rng() * out.length)] = pick.id;
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

/** Passive Mirror: consumed when it bounces an item back at whoever used it. */
export function tryMirror(content: ContentBundle, g: GameState, s: Step, playerId: PlayerId): boolean {
  const p = g.players[playerId];
  const mirror = content.items.find((i) => i.effect === "mirror");
  if (!p || !mirror) return false;
  const idx = p.items.indexOf(mirror.id);
  if (idx < 0) return false;
  p.items.splice(idx, 1);
  emit(s, { type: "shieldBlocked", playerId });
  emit(s, { type: "sfx", id: "shield" });
  return true;
}

export function log(g: GameState, s: Step, text: string, playerId?: PlayerId, kind?: GameLogEntry["kind"]) {
  g.log.push({ at: s.ctx.now, text, playerId, ...(kind ? { kind } : {}) });
  if (g.log.length > 30) g.log.splice(0, g.log.length - 30);
}

/**
 * Apply an item used at turn start. Question-time items (peek, wide tolerance) are applied by
 * the question round. Validation of phase/ownership happens in the engine.
 * Returns a short description of what it did (for the game log).
 */
export function applyTurnStartItem(
  g: GameState,
  s: Step,
  playerId: PlayerId,
  item: Item,
  targetId?: PlayerId,
  names: Record<PlayerId, string> = {},
): string {
  const p = g.players[playerId];
  const content = s.ctx.content;
  const n = (id: PlayerId) => names[id] ?? "them";
  switch (item.effect) {
    case "doubleDice":
    case "customDice":
      if (g.pendingDice) fail("INVALID_INPUT", "You already changed your dice this turn.");
      g.pendingDice = item.effect === "doubleDice" ? { kind: "double", count: item.params.dice ?? 2 } : { kind: "custom" };
      return item.effect === "doubleDice" ? `rolls ${item.params.dice ?? 2} dice this turn` : "picks their own roll";
    case "warpToStar": {
      // Land right in front of the star; your roll then (very likely) passes it.
      const board = getBoard(s.ctx.content, g.boardId);
      const before = prevTiles(board, g.starTileId).filter((t) => t !== g.starTileId);
      if (!before.length) fail("INVALID_INPUT", "Can't warp right now.");
      p.tileId = before[Math.floor(s.ctx.rng() * before.length)];
      emit(s, { type: "tokenTeleported", playerId, tileId: p.tileId });
      emit(s, { type: "sfx", id: "star" });
      return "warped right in front of the star";
    }
    case "coinMagnet": {
      // Pull coins from everyone else (Shields block it for their owner).
      let total = 0;
      for (const other of Object.keys(g.players).filter((x) => x !== playerId)) {
        if (tryMirror(content, g, s, other)) {
          total -= transferCoins(g, s, playerId, other, item.params.amount ?? 3, "steal");
          continue;
        }
        if (tryShield(g, s, other)) continue;
        total += transferCoins(g, s, other, playerId, item.params.amount ?? 3, "steal");
      }
      emit(s, { type: "sfx", id: "steal" });
      return total >= 0 ? `pulled ${total} coins from everyone` : `got pulled the wrong way by a Mirror (${total} coins)`;
    }
    case "bankHeist": {
      if (!Object.values(g.tileTypes).includes("bank")) fail("INVALID_INPUT", "There's no Piggy Bank on this map.");
      if (g.bank <= 0) fail("INVALID_INPUT", "The Piggy Bank is empty right now.");
      const pot = g.bank;
      g.bank = 0;
      changeCoins(g, s, playerId, pot, "tile:bank");
      emit(s, { type: "sfx", id: "fanfare" });
      return `grabbed ${pot} coins from the Piggy Bank`;
    }
    case "sprint": {
      if (g.diceBonus) fail("INVALID_INPUT", "You're already sprinting this turn.");
      g.diceBonus = item.params.bonus ?? 3;
      return `+${g.diceBonus} steps this turn`;
    }
    case "steal":
    case "stealStar":
    case "swapper":
    case "pushBack":
    case "freeze":
    case "swapPlaces": {
      if (!targetId || targetId === playerId || !g.players[targetId]) fail("INVALID_INPUT", "Pick another player.");
      const victim = g.players[targetId];
      if (item.effect === "stealStar" && victim.stars < 1) fail("INVALID_INPUT", "They don't have a star to steal.");
      if (item.effect === "swapper" && victim.items.length < 1) fail("INVALID_INPUT", "They don't have any items.");
      if (item.effect === "freeze" && victim.effects.frozen) fail("INVALID_INPUT", "They're already frozen.");
      if (tryMirror(content, g, s, targetId)) {
        // Swapping places is the same both ways round: a bounced swap just doesn't happen.
        if (item.effect === "swapPlaces") return `${n(targetId)}'s Mirror bounced it: nobody moved`;
        return `${n(targetId)}'s Mirror bounced it back: ${hitWith(g, s, item, targetId, playerId, true)}`;
      }
      if (tryShield(g, s, targetId)) return "a Shield blocked it";
      return hitWith(g, s, item, playerId, targetId, false);
    }
    case "tollBooth": {
      if (g.tolls?.some((t) => t.tileId === p.tileId)) fail("INVALID_INPUT", "There's already a Toll Booth here.");
      g.tolls = [...(g.tolls ?? []), { tileId: p.tileId, ownerId: playerId, amount: item.params.amount ?? 3 }];
      emit(s, { type: "sfx", id: "buy" });
      return `built a Toll Booth here (${item.params.amount ?? 3} coins per visitor)`;
    }
    case "starRadar": {
      // Lock in where the star goes next and let this player see it.
      if (!g.starNext) {
        const options = starCandidates(getBoard(content, g.boardId), g);
        g.starNext = options[Math.floor(s.ctx.rng() * options.length)];
      }
      if (!g.starRadar?.includes(playerId)) g.starRadar = [...(g.starRadar ?? []), playerId];
      return "knows where the star goes next";
    }
    case "pickTarget":
      if (!targetId || !g.players[targetId]) fail("INVALID_INPUT", "Pick a player.");
      g.targetOverride = { by: playerId, targetId };
      return "the next question will be about them";
    default:
      return fail("INVALID_INPUT", `${localize(item.name)} can't be used now.`);
  }
}

/**
 * A targeted item's effect, from `by` onto `on`. `bounced`: a Mirror turned it around, so `on` is the
 * player who used the item. Returns what happened for the game log, from the item user's side.
 */
function hitWith(g: GameState, s: Step, item: Item, by: PlayerId, on: PlayerId, bounced: boolean): string {
  const attacker = g.players[by];
  const victim = g.players[on];
  const content = s.ctx.content;
  switch (item.effect) {
    case "steal": {
      const taken = transferCoins(g, s, on, by, item.params.amount ?? GAME_CONFIG.items.stealCoins, "steal");
      if (taken > 0) {
        attacker.stats.steals++;
        victim.stats.stolenFrom++;
      }
      emit(s, { type: "sfx", id: "steal" });
      return bounced ? `lost ${taken} coins` : `took ${taken} coins`;
    }
    case "stealStar": {
      if (victim.stars < 1) return bounced ? "but had no star to lose" : "but they had no star";
      changeStars(g, s, on, -1, "stolen");
      changeStars(g, s, by, 1, "stolen");
      attacker.stats.steals++;
      victim.stats.stolenFrom++;
      emit(s, { type: "sfx", id: "star" });
      return bounced ? "lost a star" : "stole a star";
    }
    case "swapper": {
      // Take a random item from them (never the Swapper being used), give them a random one from the shop.
      const own = content.items.find((i) => i.effect === "swapper")?.id;
      const skip = on === g.order[g.activeIndex] && own ? victim.items.indexOf(own) : -1;
      const pool = victim.items.map((id, i) => ({ id, i })).filter((x) => x.i !== skip);
      if (!pool.length) return "but there was nothing to swap";
      const taken = pool[Math.floor(s.ctx.rng() * pool.length)];
      victim.items.splice(taken.i, 1);
      attacker.items.push(taken.id);
      const gift = weightedPick(s.ctx.rng, availableItems(content, g), (i) => i.weight)!;
      victim.items.push(gift.id);
      emit(s, { type: "itemGained", playerId: by, itemId: taken.id });
      emit(s, { type: "itemGained", playerId: on, itemId: gift.id });
      emit(s, { type: "sfx", id: "whoosh" });
      const takenItem = content.items.find((i) => i.id === taken.id);
      const takenName = takenItem ? localize(takenItem.name) : "item";
      return bounced ? `lost their ${takenName} and got a ${localize(gift.name)}` : `took their ${takenName} and left them a ${localize(gift.name)}`;
    }
    case "pushBack": {
      const board = getBoard(content, g.boardId);
      const path = walkBack(board, victim.tileId, item.params.steps ?? 4, s.ctx.rng);
      if (path.length) {
        victim.tileId = path[path.length - 1];
        emit(s, { type: "tokenMoved", playerId: on, path });
      }
      emit(s, { type: "sfx", id: "bad" });
      const tiles = `${path.length} ${path.length === 1 ? "tile" : "tiles"}`;
      return bounced ? `got pushed back ${tiles}` : `pushed them back ${tiles}`;
    }
    case "freeze": {
      if (victim.effects.frozen) return "nothing happened";
      victim.effects.frozen = true;
      emit(s, { type: "sfx", id: "shield" });
      return bounced ? "skips their own next turn" : "they skip their next turn";
    }
    case "swapPlaces": {
      [attacker.tileId, victim.tileId] = [victim.tileId, attacker.tileId];
      emit(s, { type: "tokenTeleported", playerId: by, tileId: attacker.tileId });
      emit(s, { type: "tokenTeleported", playerId: on, tileId: victim.tileId });
      emit(s, { type: "sfx", id: "whoosh" });
      return "swapped places";
    }
    default:
      return "nothing happened";
  }
}
