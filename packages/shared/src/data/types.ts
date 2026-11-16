import type { Rng } from "../rng";
import type { PlayerId, ResolvedQuestion } from "../engine/types";

/** Normalized Steam data as stored in DataSnapshot.payload. */
export interface SteamSnapshot {
  provider: "steam";
  steamId: string;
  personaName: string;
  avatarUrl?: string;
  /** Games with playtime, sorted by playtime desc. */
  games: { appId: number; name: string; minutes: number; minutes2Weeks: number }[];
  ownedCount: number;
  recent: { appId: number; name: string; minutes2Weeks: number }[];
  fetchedAt: number;
}

export type ProviderSnapshot = SteamSnapshot;

/** All linked data for one player in a room (server-only, never sent to clients). */
export interface PlayerDataBundle {
  steam?: SteamSnapshot;
}

export interface GeneratorInput {
  targetId: PlayerId;
  data: Record<PlayerId, PlayerDataBundle>;
  names: Record<PlayerId, string>;
  rng: Rng;
}

/** A generated question: everything but the target-specific framing is decided here. */
export type GeneratedQuestion = Omit<ResolvedQuestion, "isData"> & { truth: NonNullable<ResolvedQuestion["truth"]> };

export type DataQuestionGenerator = (input: GeneratorInput) => GeneratedQuestion | null;
