import type { DataQuestionGenerator } from "./types";
import { STEAM_GENERATORS } from "./steam";

/** Registry of data question generators by id. Pack questions reference these via truthSource.generator. */
export const DATA_GENERATORS: Record<string, DataQuestionGenerator> = {
  ...STEAM_GENERATORS,
};
