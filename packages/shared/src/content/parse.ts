import { z } from "zod";
import {
  BoardSchema,
  BluffFileSchema,
  SpectrumFileSchema,
  SpyGridWordsFileSchema,
  BonusStarsFileSchema,
  EventsFileSchema,
  ItemsFileSchema,
  MinigamesFileSchema,
  PackSchema,
  ThemesFileSchema,
  TilesFileSchema,
  type ContentBundle,
} from "./schemas";
import { lintContent } from "./lint";

export interface RawContent {
  themes: unknown;
  tiles: unknown;
  items: unknown;
  events: unknown;
  bonusStars: unknown;
  minigames: unknown;
  boards: { file: string; data: unknown }[];
  packs: { file: string; data: unknown }[];
  /** Hub game content (data/hub). Missing = empty (those games can't start). */
  hub?: { spygridWords?: unknown; spectrum?: unknown; bluff?: unknown };
}

export class ContentError extends Error {
  constructor(public problems: string[]) {
    super(`Invalid content:\n - ${problems.join("\n - ")}`);
  }
}

function parse<T>(schema: z.ZodType<T>, data: unknown, where: string, problems: string[]): T | null {
  const r = schema.safeParse(data);
  if (r.success) return r.data;
  for (const issue of r.error.issues) problems.push(`${where}: ${issue.path.join(".") || "(root)"}: ${issue.message}`);
  return null;
}

/** Validate raw content files into a bundle. Throws ContentError listing every problem. */
export function parseContent(raw: RawContent, opts: { lint?: boolean } = {}): ContentBundle {
  const problems: string[] = [];
  const themes = parse(ThemesFileSchema, raw.themes, "themes.json", problems);
  const tiles = parse(TilesFileSchema, raw.tiles, "tiles.json", problems);
  const items = parse(ItemsFileSchema, raw.items, "items.json", problems);
  const events = parse(EventsFileSchema, raw.events, "events.json", problems);
  const bonusStars = parse(BonusStarsFileSchema, raw.bonusStars, "bonusStars.json", problems);
  const minigames = parse(MinigamesFileSchema, raw.minigames, "minigames.json", problems);
  const boards = raw.boards.map((b) => parse(BoardSchema, b.data, b.file, problems));
  const packs = raw.packs.map((p) => parse(PackSchema, p.data, p.file, problems));
  const words = raw.hub?.spygridWords ? parse(SpyGridWordsFileSchema, raw.hub.spygridWords, "hub/spygrid-words.json", problems) : null;
  const spectrum = raw.hub?.spectrum ? parse(SpectrumFileSchema, raw.hub.spectrum, "hub/spectrum.json", problems) : null;
  const bluff = raw.hub?.bluff ? parse(BluffFileSchema, raw.hub.bluff, "hub/bluff.json", problems) : null;
  if (problems.length) throw new ContentError(problems);
  const bundle: ContentBundle = {
    hub: {
      spygridWords: [...new Set((words?.words ?? []).map((w) => w.toUpperCase()))],
      spectrumCards: spectrum?.cards ?? [],
      bluffPrompts: bluff?.prompts ?? [],
    },
    themes: themes!.themes,
    tiles: tiles!.tiles,
    items: items!.items,
    events: events!.events,
    bonusStars: bonusStars!.bonusStars,
    minigames: minigames!.minigames,
    boards: boards as ContentBundle["boards"],
    packs: packs as ContentBundle["packs"],
  };
  if (opts.lint !== false) {
    const lint = lintContent(bundle);
    if (lint.length) throw new ContentError(lint);
  }
  return bundle;
}
