/**
 * Browser-safe static content (themes, tiles, items, events, bonus stars, mini-game metadata).
 * Question packs and boards are loaded by the server from disk (see ./node.ts) so new packs can
 * be dropped into data/packs without touching code; clients receive resolved questions and the
 * active board through game state.
 */
import {
  BonusStarsFileSchema,
  EventsFileSchema,
  ItemsFileSchema,
  MinigamesFileSchema,
  ThemesFileSchema,
  TilesFileSchema,
} from "@party-game/shared";
import themes from "../data/themes.json";
import tiles from "../data/tiles.json";
import items from "../data/items.json";
import events from "../data/events.json";
import bonusStars from "../data/bonusStars.json";
import minigames from "../data/minigames.json";

export const clientContent = {
  themes: ThemesFileSchema.parse(themes).themes,
  tiles: TilesFileSchema.parse(tiles).tiles,
  items: ItemsFileSchema.parse(items).items,
  events: EventsFileSchema.parse(events).events,
  bonusStars: BonusStarsFileSchema.parse(bonusStars).bonusStars,
  minigames: MinigamesFileSchema.parse(minigames).minigames,
};

export type ClientContent = typeof clientContent;
