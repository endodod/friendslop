import { GAME_CONFIG } from "../config/game";
import type { EventCard } from "../content/schemas";
import { emit, type Step } from "../engine/context";
import type { GameState, PlayerId } from "../engine/types";
import { localize } from "../i18n";
import { pick, weightedPick } from "../rng";
import { getBoard, placeStar, walkBack } from "./board";
import { changeCoins, transferCoins } from "./economy";
import { tryShield } from "./items";

export function drawEvent(s: Step): EventCard {
  return weightedPick(s.ctx.rng, s.ctx.content.events, (e) => e.weight)!;
}

/**
 * Apply an event card for the landing player. Returns a short description of what happened.
 * Negative effects can be blocked by a Shield for each affected player.
 */
export function applyEvent(
  g: GameState,
  s: Step,
  card: EventCard,
  playerId: PlayerId,
  names: Record<PlayerId, string>,
): { text: string; affected: PlayerId[]; blocked: PlayerId[] } {
  const rng = s.ctx.rng;
  const board = getBoard(s.ctx.content, g.boardId);
  const ids = Object.keys(g.players);
  const others = ids.filter((p) => p !== playerId);
  const amount = card.params.amount ?? 3;
  const blocked: PlayerId[] = [];
  const affectedOk = (pid: PlayerId) => {
    if (card.negative && tryShield(g, s, pid)) {
      blocked.push(pid);
      return false;
    }
    return true;
  };
  const n = (id: PlayerId) => names[id] ?? "?";
  const byCoins = [...ids].sort((a, b) => g.players[b].stars - g.players[a].stars || g.players[b].coins - g.players[a].coins);

  switch (card.effect) {
    case "swapRandom": {
      const other = pick(rng, others);
      if (!affectedOk(other)) return { text: `${n(other)}'s shield blocked the swap!`, affected: [], blocked };
      const a = g.players[playerId];
      const b = g.players[other];
      [a.tileId, b.tileId] = [b.tileId, a.tileId];
      emit(s, { type: "tokenTeleported", playerId, tileId: a.tileId });
      emit(s, { type: "tokenTeleported", playerId: other, tileId: b.tileId });
      return { text: `${n(playerId)} swapped places with ${n(other)}!`, affected: [playerId, other], blocked };
    }
    case "allMoveBack": {
      const steps = card.params.steps ?? 3;
      const affected: PlayerId[] = [];
      for (const pid of ids) {
        if (!affectedOk(pid)) continue;
        const path = walkBack(board, g.players[pid].tileId, steps, rng);
        if (path.length) {
          g.players[pid].tileId = path[path.length - 1];
          emit(s, { type: "tokenMoved", playerId: pid, path });
          affected.push(pid);
        }
      }
      return { text: `Everyone moves back ${steps} spaces!`, affected, blocked };
    }
    case "stealFromLeader": {
      const leader = byCoins.find((p) => p !== playerId);
      if (!leader || byCoins[0] === playerId) {
        changeCoins(g, s, playerId, Math.ceil(amount / 2), "event");
        return { text: `${n(playerId)} is already leading — a small consolation prize instead.`, affected: [playerId], blocked };
      }
      if (!affectedOk(leader)) return { text: `${n(leader)}'s shield blocked the heist!`, affected: [], blocked };
      const taken = transferCoins(g, s, leader, playerId, amount, "event");
      return { text: `${n(playerId)} stole ${taken} coins from the leader, ${n(leader)}!`, affected: [leader, playerId], blocked };
    }
    case "giveLastPlace": {
      const last = byCoins[byCoins.length - 1];
      changeCoins(g, s, last, amount, "event");
      return { text: `Charity! ${n(last)} (last place) gets ${amount} coins.`, affected: [last], blocked };
    }
    case "everyoneCoins": {
      for (const pid of ids) changeCoins(g, s, pid, amount, "event");
      return { text: `Coin rain! Everyone gets ${amount} coins.`, affected: ids, blocked };
    }
    case "loseCoins": {
      if (!affectedOk(playerId)) return { text: `${n(playerId)}'s shield saved their wallet!`, affected: [], blocked };
      const lost = -changeCoins(g, s, playerId, -amount, "event");
      return { text: `${n(playerId)} dropped ${lost} coins down a drain.`, affected: [playerId], blocked };
    }
    case "moveStar": {
      placeStar(board, g, rng);
      emit(s, { type: "starMoved", tileId: g.starTileId });
      return { text: `The star flew away to a new spot!`, affected: [], blocked };
    }
    case "teleportRandom": {
      const tile = pick(rng, board.tiles.filter((t) => t.id !== g.players[playerId].tileId)).id;
      g.players[playerId].tileId = tile;
      emit(s, { type: "tokenTeleported", playerId, tileId: tile });
      return { text: `${n(playerId)} got teleported somewhere random!`, affected: [playerId], blocked };
    }
    case "shareWealth": {
      const total = ids.reduce((sum, pid) => sum + g.players[pid].coins, 0);
      const each = Math.floor(total / ids.length);
      for (const pid of ids) changeCoins(g, s, pid, each - g.players[pid].coins, "event");
      return { text: `Communism tile! Coins are split evenly: ${each} each.`, affected: ids, blocked };
    }
  }
  void GAME_CONFIG;
  return { text: localize(card.description), affected: [], blocked };
}
