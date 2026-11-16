"use client";
import type { ClientEntry } from "./kit/types";
import { SeriesClient } from "./kit/SeriesClient";
import { ChickenClient } from "./chicken/Client";
import { ColorClashClient } from "./color-clash/Client";
import { CountItClient } from "./count-it/Client";
import { DuelClient } from "./duel/Client";
import { HigherLowerCardsClient } from "./higher-lower-cards/Client";
import { HotOrNotClient } from "./hot-or-not/Client";
import { HotPotatoClient } from "./hot-potato/Client";
import { MemoryFlipClient } from "./memory-flip/Client";
import { MinefieldClient } from "./minefield/Client";
import { MostLikelyToClient } from "./most-likely-to/Client";
import { MusicalChairsClient } from "./musical-chairs/Client";
import { MysteryAuctionClient } from "./mystery-auction/Client";
import { PerfectTimingClient } from "./perfect-timing/Client";
import { PumpItClient } from "./pump-it/Client";
import { QuickMathClient } from "./quick-math/Client";
import { ReactionTapClient } from "./reaction-tap/Client";
import { RedLightClient } from "./red-light/Client";
import { SimonClient } from "./simon/Client";
import { SplitOrStealClient } from "./split-or-steal/Client";
import { SpotTheOddClient } from "./spot-the-odd/Client";
import { StackerClient } from "./stacker/Client";
import { StopTheBarClient } from "./stop-the-bar/Client";
import { ThinIceClient } from "./thin-ice/Client";
import { TypeRaceClient } from "./type-race/Client";
import { WhackAMoleClient } from "./whack-a-mole/Client";

/**
 * Client-side registry: mini-game id → React component.
 * Add a mini-game: create src/<id>/Client.tsx and register it here (and in server.ts).
 */
export const MINIGAME_CLIENTS: Record<string, ClientEntry> = {
  "red-light": { Component: RedLightClient },
  "musical-chairs": { Component: MusicalChairsClient },
  chicken: { Component: ChickenClient },
  "reaction-tap": { Component: ReactionTapClient },
  stacker: { Component: StackerClient },
  "pump-it": { Component: PumpItClient },
  "memory-flip": { Component: MemoryFlipClient },
  "stop-the-bar": { Component: StopTheBarClient },
  "higher-lower-cards": { Component: HigherLowerCardsClient },
  "spot-the-odd": { Component: SpotTheOddClient },
  "count-it": { Component: CountItClient },
  "color-clash": { Component: ColorClashClient },
  "whack-a-mole": { Component: WhackAMoleClient },
  "perfect-timing": { Component: PerfectTimingClient },
  "type-race": { Component: TypeRaceClient },
  "quick-math": { Component: QuickMathClient },
  simon: { Component: SimonClient },
  minefield: { Component: MinefieldClient },
  "thin-ice": { Component: ThinIceClient },
  "hot-potato": { Component: HotPotatoClient },
  "split-or-steal": { Component: SplitOrStealClient },
  "mystery-auction": { Component: MysteryAuctionClient },
  "hot-or-not": { Component: HotOrNotClient },
  "most-likely-to": { Component: MostLikelyToClient },
  duel: { Component: DuelClient },
  "speed-sync": { Component: SeriesClient },
  ranking: { Component: SeriesClient },
};

export type { MinigameClientProps, MinigameUiKit, KitPlayer, ClientEntry } from "./kit/types";
