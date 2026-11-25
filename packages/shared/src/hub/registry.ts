import { bluff } from "./games/bluff";
import { spectrum } from "./games/spectrum";
import { spyGrid } from "./games/spygrid";
import type { AnyHubGame, HubGameId } from "./types";

/** Every hub game's rules. The party board game has its own engine (engine/game.ts). */
export const HUB_GAMES: Record<HubGameId, AnyHubGame> = {
  spygrid: spyGrid,
  spectrum,
  bluff,
};
