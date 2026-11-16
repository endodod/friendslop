"use client";
import type { ClientEntry } from "./kit/types";

/**
 * Client-side registry: mini-game id → React component.
 * Add a mini-game: create src/<id>/Client.tsx and register it here (and in server.ts).
 */
export const MINIGAME_CLIENTS: Record<string, ClientEntry> = {};

export type { MinigameClientProps, MinigameUiKit, KitPlayer, ClientEntry } from "./kit/types";
