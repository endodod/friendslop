export const env = {
  port: Number(process.env.PORT ?? 4000),
  host: process.env.HOST ?? "0.0.0.0",
  databaseUrl: process.env.DATABASE_URL ?? "",
  steamApiKey: process.env.STEAM_API_KEY ?? "",
  /** Allowed browser origins for Socket.IO CORS (comma separated). Empty = allow all (dev). */
  webOrigins: (process.env.WEB_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  /** Fixed seed for reproducible games (tests). */
  seed: process.env.GAME_SEED ? Number(process.env.GAME_SEED) : undefined,
  /** Speeds up all timers (tests / dev). 1 = normal. */
  timeScale: Number(process.env.TIME_SCALE ?? 1),
};
