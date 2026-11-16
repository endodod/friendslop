import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { env } from "../config";

let client: PrismaClient | null = null;
let ready = false;

/**
 * Postgres is optional: without DATABASE_URL (or if it's unreachable) the game runs fine,
 * it just doesn't keep linked accounts, match history or question stats.
 */
export async function initDb(): Promise<PrismaClient | null> {
  if (!env.databaseUrl) {
    console.warn("[db] DATABASE_URL not set — running without persistence");
    return null;
  }
  try {
    client = new PrismaClient({ adapter: new PrismaPg({ connectionString: env.databaseUrl }) });
    await client.$queryRaw`SELECT 1`;
    ready = true;
    console.log("[db] connected");
    return client;
  } catch (e) {
    console.warn("[db] could not connect — running without persistence:", (e as Error).message);
    client = null;
    return null;
  }
}

export function db(): PrismaClient | null {
  return ready ? client : null;
}

/** Run a DB task without ever letting it break the game. */
export async function safely<T>(label: string, fn: (db: PrismaClient) => Promise<T>): Promise<T | null> {
  const c = db();
  if (!c) return null;
  try {
    return await fn(c);
  } catch (e) {
    console.warn(`[db] ${label} failed:`, (e as Error).message);
    return null;
  }
}
