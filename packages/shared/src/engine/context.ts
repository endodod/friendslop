import type { ContentBundle } from "../content/schemas";
import type { MinigameRegistry } from "../minigame/types";
import type { DataQuestionGenerator, PlayerDataBundle } from "../data/types";
import type { Rng } from "../rng";
import type { GameEvent, PlayerId } from "./types";

export interface EngineContext {
  content: ContentBundle;
  minigames: MinigameRegistry;
  generators: Record<string, DataQuestionGenerator>;
  playerData: Record<PlayerId, PlayerDataBundle>;
  rng: Rng;
  now: number;
}

/** Mutable scratch passed through one engine step; collects events. */
export interface Step {
  ctx: EngineContext;
  events: GameEvent[];
}

export function emit(step: Step, e: GameEvent) {
  step.events.push(e);
}

let uidCounter = 0;
export function uid(rng: Rng): string {
  uidCounter = (uidCounter + 1) % 1e6;
  return Math.floor(rng() * 36 ** 6).toString(36).padStart(6, "0") + uidCounter.toString(36);
}
