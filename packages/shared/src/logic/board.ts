import { GAME_CONFIG } from "../config/game";
import type { Board, BoardTile, ContentBundle, TileDef } from "../content/schemas";
import { pick, shuffle, type Rng } from "../rng";
import type { GameState, TileFrequency } from "../engine/types";

/** Lobby setting value meaning "pick a map at random when the game starts". */
export const RANDOM_BOARD_ID = "random";

/** Resolve the lobby's map choice ("random" picks one of the shipped maps). */
export function resolveBoardId(content: ContentBundle, id: string, rng: () => number): string {
  if (id !== RANDOM_BOARD_ID || content.boards.length === 0) return id;
  return content.boards[Math.floor(rng() * content.boards.length)].id;
}

export function getBoard(content: ContentBundle, id: string): Board {
  const b = content.boards.find((x) => x.id === id) ?? content.boards[0];
  if (!b) throw new Error("no boards in content");
  return b;
}

export function getTile(board: Board, id: string): BoardTile {
  const t = board.tiles.find((x) => x.id === id);
  if (!t) throw new Error(`unknown tile ${id}`);
  return t;
}

export function tileDef(content: ContentBundle, typeId: string): TileDef {
  const d = content.tiles.find((t) => t.id === typeId);
  if (!d) throw new Error(`unknown tile type ${typeId}`);
  return d;
}

export function nextTiles(board: Board, id: string): string[] {
  return getTile(board, id).next;
}

export function prevTiles(board: Board, id: string): string[] {
  return board.tiles.filter((t) => t.next.includes(id)).map((t) => t.id);
}

/** Walk backwards n steps (random at merges). Returns the path walked. */
export function walkBack(board: Board, from: string, steps: number, rng: Rng): string[] {
  const path: string[] = [];
  let cur = from;
  for (let i = 0; i < steps; i++) {
    const prev = prevTiles(board, cur);
    if (!prev.length) break;
    cur = pick(rng, prev);
    path.push(cur);
  }
  return path;
}

/**
 * Tile mix: per tile type, "off" turns all of them into filler (blue), "few" about half,
 * "many" turns extra filler tiles into that type. The board's design is "normal".
 */
export function computeTileTypes(
  board: Board,
  content: ContentBundle,
  frequency: Record<string, TileFrequency>,
  rng: Rng,
): Record<string, string> {
  const cfg = GAME_CONFIG.tiles;
  const types: Record<string, string> = Object.fromEntries(board.tiles.map((t) => [t.id, t.type]));
  const filler = content.tiles.find((d) => d.pacingGroup === "filler")?.id ?? "blue";
  const tunable = Object.entries(frequency).filter(([type]) => !cfg.notTunable.includes(type) && type !== filler);
  const ofType = (type: string) => board.tiles.filter((t) => types[t.id] === type && t.id !== board.startTileId);
  const original = Object.fromEntries(tunable.map(([type]) => [type, ofType(type).length]));

  // 1. Fewer / none
  for (const [type, f] of tunable) {
    const factor = cfg.frequency[f] ?? 1;
    if (factor >= 1) continue;
    const tiles = ofType(type);
    const remove = Math.round(tiles.length * (1 - factor));
    for (const t of shuffle(rng, tiles).slice(0, remove)) types[t.id] = filler;
  }
  // 2. More: take filler tiles, round-robin between the "many" types, keeping some filler for the star.
  const wants = tunable
    .filter(([, f]) => (cfg.frequency[f] ?? 1) > 1)
    .map(([type, f]) => ({
      type,
      left: original[type] ? Math.max(1, Math.round(original[type] * ((cfg.frequency[f] ?? 1) - 1))) : cfg.addWhenAbsent,
    }));
  const pool = shuffle(rng, ofType(filler));
  let budget = Math.max(0, pool.length - cfg.minFillerTiles);
  while (budget > 0 && wants.some((w) => w.left > 0)) {
    for (const w of wants) {
      if (budget <= 0 || w.left <= 0) continue;
      const t = pool.shift()!;
      types[t.id] = w.type;
      w.left--;
      budget--;
    }
  }
  return types;
}

/** Shortest number of steps from Start to every tile. */
export function stepsFromStart(board: Board): Map<string, number> {
  const dist = new Map<string, number>([[board.startTileId, 0]]);
  const queue = [board.startTileId];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const n of nextTiles(board, cur)) {
      if (dist.has(n)) continue;
      dist.set(n, dist.get(cur)! + 1);
      queue.push(n);
    }
  }
  return dist;
}

/** The star stays out of the first few steps after Start; bigger maps keep a bigger gap. */
export function starSafeZone(board: Board): number {
  const cfg = GAME_CONFIG.star;
  return Math.max(cfg.minSafeZone, Math.round(board.tiles.length / cfg.safeZonePerTiles));
}

/**
 * Tiles the star may appear on: any tile type, but not Start, not within the safe zone after Start,
 * not where it is now and not anywhere it has already been this game. Once it has been everywhere,
 * the history starts over.
 */
export function starCandidates(board: Board, game: Pick<GameState, "starTileId" | "starVisited"> | null): string[] {
  const dist = stepsFromStart(board);
  const zone = starSafeZone(board);
  const open = board.tiles.map((t) => t.id).filter((id) => id !== board.startTileId && (dist.get(id) ?? Infinity) > zone);
  const notHere = open.filter((id) => id !== game?.starTileId);
  const fresh = notHere.filter((id) => !game?.starVisited?.includes(id));
  if (fresh.length) return fresh;
  if (notHere.length) return notHere;
  return board.tiles.map((t) => t.id).filter((id) => id !== board.startTileId && id !== game?.starTileId);
}

/** Move the star to a new tile and remember it, so it never comes back to the same tile. */
export function placeStar(board: Board, game: Pick<GameState, "starTileId" | "starVisited">, rng: Rng): string {
  const candidates = starCandidates(board, game);
  // History exhausted: start a new round of tiles.
  if (candidates.some((id) => game.starVisited?.includes(id))) game.starVisited = [];
  const tile = pick(rng, candidates);
  game.starTileId = tile;
  game.starVisited = [...(game.starVisited ?? []), tile];
  return tile;
}
