/**
 * Every tunable number in the game lives here: coins, timers, tolerances, star cost, rewards.
 * Change values here, not in logic.
 */
export const GAME_CONFIG = {
  players: { min: 2, max: 4 },

  turns: { options: [10, 12, 15, 20] as const, default: 12 },

  economy: {
    startCoins: 10,
    startStars: 0,
    starCost: 20,
    maxItems: 3,
    shopStockSize: 4,
  },

  dice: { sides: 6 },

  /** Phase timers in milliseconds. Every phase that waits for input has one. */
  timers: {
    /** Max time on the how-to-play screen (ends early once everyone taps "Got it!"). */
    gameStartMs: 30000,
    turnStartMs: 20000,
    rollingMs: 1400,
    hopMs: 330,
    junctionMs: 12000,
    tileEffectMs: 2200,
    shopMs: 20000,
    starPurchaseMs: 12000,
    eventMs: 4500,
    duelPickMs: 12000,
    turnEndMs: 900,
    roundEndMs: 2500,
    gameEndMs: 3000,
    bonusStarRevealMs: 4000,
    /** How long a disconnected player's turn waits before auto-playing. */
    disconnectedAutoplayMs: 4000,
  },

  question: {
    introMs: 3200,
    answerMs: 20000,
    /** Reveal timing: per guesser answer, then the target's answer with suspense. */
    revealPerAnswerMs: 900,
    targetRevealMs: 2600,
    resultsMs: 5500,
    /** Rewards on board question tiles. */
    guesserMatchCoins: 3,
    perfectBonusCoins: 2,
    targetCoinsPerMatch: 2,
    dataMultiplier: 2,
    dataTargetCorrectCoins: 3,
    /** Default tolerance for the `scale` format (absolute). */
    scaleTolerance: 1,
    /**
     * `scale` (1–10) questions pay by distance from the target's answer: index = steps away.
     * Exact = 5 (match + perfect bonus), 1 off = 3 (match), 2 off = 1 (close, no match).
     */
    scaleCoinsByDistance: [5, 3, 1] as number[],
    /** Ranking: share of items in the correct position needed to count as a match. */
    rankingMatchShare: 0.5,
    /** Wide Tolerance item multiplies tolerance by this. */
    wideToleranceMultiplier: 2,
    /** Pacing: how many question tiles are turned on, by setting. */
    pacing: { low: 0.5, normal: 1, high: 1.5 },
  },

  minigame: {
    /** Max time on the tutorial screen (ends early once every participant taps "Got it!"). */
    introMs: 30000,
    countdownMs: 3600,
    resultsMs: 6500,
    /** Extra time after a mini-game's duration before forcing results. */
    graceMs: 3000,
    /** Placement → coins, by number of participants. Ties share the better placement. */
    placementCoins: {
      2: [10, 2],
      3: [10, 5, 0],
      4: [10, 5, 2, 0],
    } as Record<number, number[]>,
    /** Realtime mini-games tick at this rate on the server. */
    tickHz: 15,
    /** Reaction times below this are rejected as implausible. */
    minHumanReactionMs: 100,
  },

  duel: { stealCoins: 5, answerMs: 15000 },

  items: { stealCoins: 5 },

  /** Bonus stars shown per game (randomly chosen from content). */
  bonusStars: { count: { min: 2, max: 3 } },

  rateLimit: { eventsPerSecond: 30 },

  room: {
    codeLength: 4,
    /** No ambiguous letters (I, O, 0, 1, L). */
    codeAlphabet: "ABCDEFGHJKMNPQRSTUVWXYZ",
    /** Empty rooms are removed after this. */
    emptyRoomTtlMs: 30 * 60 * 1000,
  },

  data: { snapshotMaxAgeMs: 60 * 60 * 1000 },
} as const;

export type GameConfig = typeof GAME_CONFIG;

export const PLAYER_COLORS = [
  { id: "red", hex: "#ff4d5e", name: "Red" },
  { id: "blue", hex: "#3d8bff", name: "Blue" },
  { id: "green", hex: "#2fd27a", name: "Green" },
  { id: "yellow", hex: "#ffc933", name: "Yellow" },
  { id: "purple", hex: "#b26bff", name: "Purple" },
  { id: "orange", hex: "#ff8a3d", name: "Orange" },
  { id: "pink", hex: "#ff6bc6", name: "Pink" },
  { id: "teal", hex: "#2fd6d0", name: "Teal" },
] as const;

export type PlayerColorId = (typeof PLAYER_COLORS)[number]["id"];

export function colorHex(id: string): string {
  return PLAYER_COLORS.find((c) => c.id === id)?.hex ?? "#999999";
}
