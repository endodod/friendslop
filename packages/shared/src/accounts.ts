import { z } from "zod";
import type { CustomQuestionDraft } from "./logic/custom";

/** Usernames: 3–20 letters, digits or underscores. Unique ignoring case. */
export const UsernameSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_]{3,20}$/, "Usernames are 3–20 letters, numbers or underscores.");
export const PasswordSchema = z.string().min(8, "Passwords need at least 8 characters.").max(200);

export const CredentialsSchema = z.object({ username: UsernameSchema, password: PasswordSchema });

/** Max upload size for a profile picture (the client resizes to 256×256 first). */
export const AVATAR_MAX_BYTES = 512 * 1024;
export const AVATAR_SIZE = 256;

export interface UserStats {
  gamesPlayed: number;
  gamesWon: number;
  starsCollected: number;
  /** Per game of the hub (missing = never played). */
  byGame?: Record<string, { played: number; won: number }>;
}

export interface PublicUser {
  id: string;
  username: string;
  /** Server path of the profile picture, or null. Prefix with the game server URL. */
  photo: string | null;
  createdAt: string;
  stats: UserStats;
}

export type FriendStatus = "friends" | "incoming" | "outgoing" | "none" | "self";

export interface FriendEntry {
  user: Pick<PublicUser, "id" | "username" | "photo">;
  /** friends = accepted; incoming = they asked you; outgoing = you asked them */
  status: Exclude<FriendStatus, "none" | "self">;
  online: boolean;
  /** Room code the friend is currently in (friends only), else null. */
  inRoom: string | null;
}

export function avatarPath(userId: string, version: number): string {
  return `/api/users/${userId}/avatar?v=${version}`;
}

/** Custom questions kept on a profile. */
export const SAVED_QUESTIONS_MAX = 200;

export interface SavedQuestion {
  id: string;
  draft: CustomQuestionDraft;
  createdAt: string;
}
