import { bluff } from "./games/bluff";
import { clueCrew } from "./games/cluecrew";
import { countUp } from "./games/countup";
import { oddWord } from "./games/oddword";
import { spectrum } from "./games/spectrum";
import { spyGrid } from "./games/spygrid";
import { whoWrote } from "./games/whowrote";
import type { AnyHubGame, HubGameId } from "./types";

/** Every hub game's rules. The party board game has its own engine (engine/game.ts). */
export const HUB_GAMES: Record<HubGameId, AnyHubGame> = {
  spygrid: spyGrid,
  spectrum,
  bluff,
  whowrote: whoWrote,
  countup: countUp,
  cluecrew: clueCrew,
  oddword: oddWord,
};
