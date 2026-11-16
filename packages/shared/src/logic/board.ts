import { GAME_CONFIG } from "../config/game";
import type { Board, BoardTile, ContentBundle, TileDef } from "../content/schemas";
import { pick, shuffle, type Rng } from "../rng";
import type { GameState, QuestionPacing } from "../engine/types";

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
 * Question pacing: tiles in pacing group "question" are question tiles at normal pacing.
 * Low pacing turns some into filler (blue); high pacing turns some filler into question tiles.
 */
export function computeTileTypes(
  board: Board,
  content: ContentBundle,
  pacing: QuestionPacing,
  rng: Rng,
): Record<string, string> {
  const types: Record<string, string> = Object.fromEntries(board.tiles.map((t) => [t.id, t.type]));
  const group = (t: BoardTile) => content.tiles.find((d) => d.id === t.type)?.pacingGroup;
  const questionTiles = board.tiles.filter((t) => group(t) === "question" && t.type === "question");
  const fillers = board.tiles.filter((t) => group(t) === "filler");
  const factor = GAME_CONFIG.question.pacing[pacing];
  const filler = content.tiles.find((d) => d.pacingGroup === "filler")?.id ?? "blue";
  if (factor < 1) {
    const remove = Math.round(questionTiles.length * (1 - factor));
    for (const t of shuffle(rng, questionTiles).slice(0, remove)) types[t.id] = filler;
  } else if (factor > 1) {
    const add = Math.round(questionTiles.length * (factor - 1));
    for (const t of shuffle(rng, fillers).slice(0, add)) types[t.id] = "question";
  }
  return types;
}

export function starEligibleTiles(board: Board, content: ContentBundle, types: Record<string, string>): string[] {
  return board.tiles
    .filter((t) => t.id !== board.startTileId && content.tiles.find((d) => d.id === types[t.id])?.starEligible)
    .map((t) => t.id);
}

export function pickStarTile(
  board: Board,
  content: ContentBundle,
  game: Pick<GameState, "tileTypes" | "starTileId"> | null,
  rng: Rng,
): string {
  const types = game?.tileTypes ?? Object.fromEntries(board.tiles.map((t) => [t.id, t.type]));
  const eligible = starEligibleTiles(board, content, types).filter((id) => id !== game?.starTileId);
  return pick(rng, eligible.length ? eligible : board.tiles.map((t) => t.id));
}
