import { z } from "zod";
import { LanguageSchema, LocalizedStringSchema } from "../i18n";

const id = z.string().regex(/^[a-z0-9][a-z0-9._-]*$/, "ids are lowercase, dot/dash separated");
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);
/** Icon ids reference files in apps/web/public/icons/<id>.svg */
const iconId = z.string().regex(/^[a-z0-9-]+$/);

// ---------------------------------------------------------------------------
// Themes
// ---------------------------------------------------------------------------
export const ThemeSchema = z.object({
  id,
  name: LocalizedStringSchema,
  icon: iconId,
  color: hexColor,
  description: LocalizedStringSchema,
});
export type Theme = z.infer<typeof ThemeSchema>;
export const ThemesFileSchema = z.object({ version: z.number().int(), themes: z.array(ThemeSchema).min(1) });

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------
export const QUESTION_FORMATS = ["tiles", "number", "scale", "player", "ranking", "higherLower"] as const;
export const QuestionFormatSchema = z.enum(QUESTION_FORMATS);
export type QuestionFormat = z.infer<typeof QuestionFormatSchema>;

export const ToleranceSchema = z.object({
  type: z.enum(["absolute", "relative"]),
  value: z.number().nonnegative(),
});
export type Tolerance = z.infer<typeof ToleranceSchema>;

export const QUESTION_USAGES = ["tile", "minigameIntro", "questionOnlyMinigame"] as const;
export const QuestionUsageSchema = z.enum(QUESTION_USAGES);
export type QuestionUsage = z.infer<typeof QuestionUsageSchema>;

export const DATA_PROVIDERS = ["steam", "spotify", "lastfm"] as const;
export const DataProviderIdSchema = z.enum(DATA_PROVIDERS);
export type DataProviderId = z.infer<typeof DataProviderIdSchema>;

export const NumberSpecSchema = z.object({
  min: z.number(),
  max: z.number(),
  step: z.number().positive(),
  unit: LocalizedStringSchema.optional(),
  tolerance: ToleranceSchema,
});
export type NumberSpec = z.infer<typeof NumberSpecSchema>;

export const QuestionSchema = z
  .object({
    id,
    themes: z.array(id).min(1),
    format: QuestionFormatSchema,
    /** Placeholders: {target}, {player:random}, {otherPlayer} */
    prompt: LocalizedStringSchema,
    /** tiles: 2–6 answers. ranking: 3–4 items to order. */
    answers: z.array(LocalizedStringSchema).optional(),
    number: NumberSpecSchema.optional(),
    /** scale (and optionally number): what the ends of the range mean, e.g. 1 = "spotless", 10 = "disaster zone". */
    scaleLabels: z.object({ min: LocalizedStringSchema, max: LocalizedStringSchema }).optional(),
    /** higherLower: the value players compare against (shown as part of the prompt). */
    reference: z.number().optional(),
    truthSource: z.object({ provider: DataProviderIdSchema, generator: z.string().min(1) }).optional(),
    tags: z.array(z.string()).optional(),
    weight: z.number().positive().optional(),
    minPlayers: z.number().int().min(2).max(4).optional(),
    usage: z.array(QuestionUsageSchema).min(1),
  })
  .superRefine((q, ctx) => {
    const n = q.answers?.length ?? 0;
    if (q.truthSource) return; // generated at runtime
    if (q.format === "tiles" && (n < 2 || n > 6))
      ctx.addIssue({ code: "custom", message: `tiles questions need 2–6 answers (has ${n})` });
    if (q.format === "ranking" && (n < 3 || n > 4))
      ctx.addIssue({ code: "custom", message: `ranking questions need 3–4 items (has ${n})` });
    if (q.format === "number" && !q.number)
      ctx.addIssue({ code: "custom", message: "number questions need a `number` spec" });
    if (q.number) {
      if (q.number.min >= q.number.max) ctx.addIssue({ code: "custom", message: "number.min must be < number.max" });
      if (q.number.step > q.number.max - q.number.min)
        ctx.addIssue({ code: "custom", message: "number.step larger than the range" });
    }
    if (q.format === "scale" && !q.scaleLabels)
      ctx.addIssue({ code: "custom", message: "scale questions need scaleLabels (what the lowest and highest values mean)" });
    if (q.format === "higherLower" && q.reference === undefined)
      ctx.addIssue({ code: "custom", message: "higherLower questions need a `reference` value" });
    if ((q.format === "player" || q.format === "number" || q.format === "scale" || q.format === "higherLower") && n > 0)
      ctx.addIssue({ code: "custom", message: `${q.format} questions must not define answers` });
  });
export type Question = z.infer<typeof QuestionSchema>;

export const PackSchema = z.object({
  id,
  name: z.string().min(1),
  language: LanguageSchema,
  version: z.number().int().default(1),
  description: z.string().optional(),
  questions: z.array(QuestionSchema).min(1),
});
export type Pack = z.infer<typeof PackSchema>;

// ---------------------------------------------------------------------------
// Tiles & boards
// ---------------------------------------------------------------------------
export const TILE_EFFECTS = ["none", "coins", "question", "data", "event", "shop", "duel"] as const;
export const TileDefSchema = z.object({
  id,
  name: LocalizedStringSchema,
  description: LocalizedStringSchema,
  icon: iconId,
  color: hexColor,
  effect: z.enum(TILE_EFFECTS),
  /** effect parameters, e.g. { amount: 3 } for coins */
  params: z.record(z.string(), z.number()).default({}),
  /** Can the star be placed on this tile type? */
  starEligible: z.boolean().default(false),
  /** Question tiles are thinned out / added by the pacing setting. */
  pacingGroup: z.enum(["question", "filler"]).optional(),
});
export type TileDef = z.infer<typeof TileDefSchema>;
export const TilesFileSchema = z.object({ version: z.number().int(), tiles: z.array(TileDefSchema).min(1) });

export const BoardTileSchema = z.object({
  id: z.string().min(1),
  type: id,
  /** Normalized SVG layout coordinates (0..1) */
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  next: z.array(z.string()).min(1).max(3),
});
export type BoardTile = z.infer<typeof BoardTileSchema>;

export const BoardSchema = z
  .object({
    id,
    name: LocalizedStringSchema,
    description: LocalizedStringSchema.optional(),
    startTileId: z.string(),
    /** Aspect ratio of the board (width / height) for rendering. */
    aspect: z.number().positive().default(1.6),
    tiles: z.array(BoardTileSchema).min(8),
  })
  .superRefine((b, ctx) => {
    const ids = new Set(b.tiles.map((t) => t.id));
    if (ids.size !== b.tiles.length) ctx.addIssue({ code: "custom", message: "duplicate tile ids" });
    if (!ids.has(b.startTileId)) ctx.addIssue({ code: "custom", message: "startTileId not found" });
    for (const t of b.tiles)
      for (const n of t.next)
        if (!ids.has(n)) ctx.addIssue({ code: "custom", message: `tile ${t.id} links to unknown ${n}` });
  });
export type Board = z.infer<typeof BoardSchema>;

// ---------------------------------------------------------------------------
// Items, events, bonus stars, mini-game metadata
// ---------------------------------------------------------------------------
export const ITEM_EFFECTS = [
  "doubleDice",
  "customDice",
  "steal",
  "pickTarget",
  "shield",
  "peek",
  "wideTolerance",
  "warpToStar",
] as const;
export const ItemSchema = z.object({
  id,
  name: LocalizedStringSchema,
  description: LocalizedStringSchema,
  icon: iconId,
  price: z.number().int().nonnegative(),
  useTiming: z.enum(["turnStart", "onQuestion", "passive"]),
  effect: z.enum(ITEM_EFFECTS),
  /** Does using this item require choosing another player? */
  needsTarget: z.boolean().default(false),
  weight: z.number().positive().default(1),
});
export type Item = z.infer<typeof ItemSchema>;
export const ItemsFileSchema = z.object({ version: z.number().int(), items: z.array(ItemSchema).min(1) });

export const EVENT_EFFECTS = [
  "swapRandom",
  "allMoveBack",
  "stealFromLeader",
  "giveLastPlace",
  "everyoneCoins",
  "loseCoins",
  "moveStar",
  "teleportRandom",
  "shareWealth",
] as const;
export const EventCardSchema = z.object({
  id,
  name: LocalizedStringSchema,
  description: LocalizedStringSchema,
  icon: iconId,
  effect: z.enum(EVENT_EFFECTS),
  params: z.record(z.string(), z.number()).default({}),
  /** Negative events can be blocked by a Shield. */
  negative: z.boolean().default(false),
  weight: z.number().positive().default(1),
});
export type EventCard = z.infer<typeof EventCardSchema>;
export const EventsFileSchema = z.object({ version: z.number().int(), events: z.array(EventCardSchema).min(1) });

export const BONUS_STAT_KEYS = [
  "matchesMade",
  "matchedAsTarget",
  "minigameWins",
  "perfectMatches",
  "coinsEarned",
  "redTiles",
  "stepsMoved",
  "itemsUsed",
] as const;
export const BonusStarSchema = z.object({
  id,
  name: LocalizedStringSchema,
  description: LocalizedStringSchema,
  icon: iconId,
  stat: z.enum(BONUS_STAT_KEYS),
  mode: z.enum(["max", "min"]),
  /** Only count players who were the target at least once (for target-based stats). */
  requiresTargetAtLeastOnce: z.boolean().default(false),
});
export type BonusStar = z.infer<typeof BonusStarSchema>;
export const BonusStarsFileSchema = z.object({
  version: z.number().int(),
  bonusStars: z.array(BonusStarSchema).min(2),
});

export const MinigameMetaSchema = z.object({
  id,
  name: LocalizedStringSchema,
  icon: iconId,
  /** One line: how you win. Shown during the intro and as a banner while playing. */
  goal: LocalizedStringSchema,
  /** Step-by-step tutorial shown on the intro screen (2–4 short steps). */
  howTo: z.array(LocalizedStringSchema).min(1).max(5),
  rules: LocalizedStringSchema,
  controls: LocalizedStringSchema,
  bonus: LocalizedStringSchema,
  weight: z.number().nonnegative().default(1),
  enabled: z.boolean().default(true),
});
export type MinigameMeta = z.infer<typeof MinigameMetaSchema>;
export const MinigamesFileSchema = z.object({
  version: z.number().int(),
  minigames: z.array(MinigameMetaSchema).min(1),
});

/** Everything the engine needs from content, validated. */
export interface ContentBundle {
  themes: Theme[];
  packs: Pack[];
  tiles: TileDef[];
  boards: Board[];
  items: Item[];
  events: EventCard[];
  bonusStars: BonusStar[];
  minigames: MinigameMeta[];
}
