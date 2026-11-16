/**
 * Single place to rename the game. The working title is a placeholder.
 * Everything user-facing reads its name from here.
 */
export const BRANDING = {
  name: "PartyGame",
  slug: "party-game",
  tagline: "How well do you really know your friends?",
  /** Prefix for localStorage keys. */
  storagePrefix: "party-game",
} as const;
