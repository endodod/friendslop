import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseContent, type ContentBundle, type RawContent } from "@party-game/shared";

export const CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "data");

function readJson(file: string): unknown {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    throw new Error(`Could not read ${file}: ${(e as Error).message}`);
  }
}

function readOptional(file: string): unknown {
  return existsSync(file) ? readJson(file) : undefined;
}

function readDir(dir: string): { file: string; data: unknown }[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => ({ file: f, data: readJson(join(dir, f)) }));
}

/** Read every content file from disk (packs/ and boards/ are scanned, so new files are picked up). */
export function readRawContent(dir = CONTENT_DIR): RawContent {
  return {
    themes: readJson(join(dir, "themes.json")),
    tiles: readJson(join(dir, "tiles.json")),
    items: readJson(join(dir, "items.json")),
    events: readJson(join(dir, "events.json")),
    bonusStars: readJson(join(dir, "bonusStars.json")),
    minigames: readJson(join(dir, "minigames.json")),
    boards: readDir(join(dir, "boards")),
    packs: readDir(join(dir, "packs")),
    hub: {
      spygridWords: readOptional(join(dir, "hub", "spygrid-words.json")),
      spectrum: readOptional(join(dir, "hub", "spectrum.json")),
      bluff: readOptional(join(dir, "hub", "bluff.json")),
      whowrote: readOptional(join(dir, "hub", "whowrote.json")),
      oddword: readOptional(join(dir, "hub", "oddword.json")),
    },
  };
}

/** Load and validate all content. Throws ContentError with every problem found. */
export function loadContent(dir = CONTENT_DIR): ContentBundle {
  return parseContent(readRawContent(dir));
}
