import type { MinigameRegistry } from "@party-game/shared";
import { chicken } from "./chicken/logic";
import { colorClash } from "./color-clash/logic";
import { countIt } from "./count-it/logic";
import { duel } from "./duel/logic";
import { higherLowerCards } from "./higher-lower-cards/logic";
import { hotOrNot } from "./hot-or-not/logic";
import { hotPotato } from "./hot-potato/logic";
import { memoryFlip } from "./memory-flip/logic";
import { minefield } from "./minefield/logic";
import { mostLikelyTo } from "./most-likely-to/logic";
import { musicalChairs } from "./musical-chairs/logic";
import { mysteryAuction } from "./mystery-auction/logic";
import { perfectTiming } from "./perfect-timing/logic";
import { pumpIt } from "./pump-it/logic";
import { quickMath } from "./quick-math/logic";
import { rankingGame } from "./ranking/logic";
import { reactionTap } from "./reaction-tap/logic";
import { redLight } from "./red-light/logic";
import { simon } from "./simon/logic";
import { speedSync } from "./speed-sync/logic";
import { splitOrSteal } from "./split-or-steal/logic";
import { spotTheOdd } from "./spot-the-odd/logic";
import { stacker } from "./stacker/logic";
import { stopTheBar } from "./stop-the-bar/logic";
import { thinIce } from "./thin-ice/logic";
import { typeRace } from "./type-race/logic";
import { whackAMole } from "./whack-a-mole/logic";

/**
 * Server-side registry. To add a mini-game: create src/<id>/logic.ts implementing
 * MiniGameDefinition, add metadata to packages/content/data/minigames.json, and register it here
 * and in client.tsx.
 */
export const MINIGAMES: MinigameRegistry = Object.fromEntries(
  [
    redLight, musicalChairs, chicken, reactionTap, stacker, pumpIt, memoryFlip, stopTheBar, higherLowerCards,
    spotTheOdd, countIt, colorClash, whackAMole, perfectTiming, typeRace, quickMath, simon, minefield, thinIce,
    hotPotato, splitOrSteal, mysteryAuction, hotOrNot, duel, mostLikelyTo, speedSync, rankingGame,
  ].map((d) => [d.id, d]),
);
