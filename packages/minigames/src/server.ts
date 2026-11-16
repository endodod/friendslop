import type { MinigameRegistry } from "@party-game/shared";

/**
 * Server-side registry. To add a mini-game: create src/<id>/logic.ts implementing
 * MiniGameDefinition, add metadata to packages/content/data/minigames.json, and register it here
 * and in client.tsx.
 */
export const MINIGAMES: MinigameRegistry = {};
