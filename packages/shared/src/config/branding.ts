/**
 * Single place to rename the game. The working title is a placeholder.
 * Everything user-facing reads its name from here.
 */
export const BRANDING = {
  name: "Friendslop",
  slug: "friendslop",
  tagline: "Party games for you and your friends. Phones are the controllers.",
  /** Prefix for localStorage keys. */
  storagePrefix: "party-game",
} as const;
