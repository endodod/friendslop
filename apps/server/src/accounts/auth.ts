import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { avatarPath, type PublicUser } from "@party-game/shared";
import type { User } from "../generated/prisma/client";
import { db } from "../persistence/db";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, salt, hash] = stored.split("$");
  if (algo !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const actual = await scrypt(password, Buffer.from(salt, "base64"), expected.length);
  return timingSafeEqual(expected, actual);
}

export const sessionId = (token: string) => createHash("sha256").update(token).digest("hex");

/** Create a session and return the bearer token (only its hash is stored). */
export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await db()!.session.create({ data: { id: sessionId(token), userId, expiresAt: new Date(Date.now() + SESSION_TTL_MS) } });
  return token;
}

export async function deleteSession(token: string) {
  await db()?.session.deleteMany({ where: { id: sessionId(token) } });
}

/** Resolve a bearer token to its user (null if missing, expired or no DB). */
export async function userFromToken(token: string | null | undefined): Promise<User | null> {
  const c = db();
  if (!c || !token) return null;
  const s = await c.session.findUnique({ where: { id: sessionId(token) }, include: { user: true } });
  if (!s) return null;
  if (s.expiresAt.getTime() < Date.now()) {
    await c.session.delete({ where: { id: s.id } }).catch(() => {});
    return null;
  }
  return s.user;
}

type PublicUserRow = Pick<User, "id" | "username" | "avatarVersion" | "avatarMime" | "createdAt" | "gamesPlayed" | "gamesWon" | "starsCollected">;

export function toPublicUser(u: PublicUserRow): PublicUser {
  return {
    id: u.id,
    username: u.username,
    photo: u.avatarMime ? avatarPath(u.id, u.avatarVersion) : null,
    createdAt: u.createdAt.toISOString(),
    stats: { gamesPlayed: u.gamesPlayed, gamesWon: u.gamesWon, starsCollected: u.starsCollected },
  };
}

/** Columns needed for toPublicUser (never selects the picture bytes or the password hash). */
export const publicUserSelect = {
  id: true,
  username: true,
  avatarVersion: true,
  avatarMime: true,
  createdAt: true,
  gamesPlayed: true,
  gamesWon: true,
  starsCollected: true,
} as const;
