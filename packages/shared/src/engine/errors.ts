export type GameErrorCode =
  | "ROOM_NOT_FOUND"
  | "ROOM_FULL"
  | "GAME_IN_PROGRESS"
  | "NAME_INVALID"
  | "NAME_TAKEN"
  | "COLOR_TAKEN"
  | "NOT_HOST"
  | "NOT_YOUR_TURN"
  | "WRONG_PHASE"
  | "INVALID_INPUT"
  | "NOT_ENOUGH_PLAYERS"
  | "NOT_READY"
  | "NOT_ENOUGH_COINS"
  | "INVENTORY_FULL"
  | "UNKNOWN_PLAYER"
  | "RATE_LIMITED"
  | "PROVIDER_ERROR";

export class GameError extends Error {
  constructor(
    public code: GameErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "GameError";
  }
}

export function fail(code: GameErrorCode, message: string): never {
  throw new GameError(code, message);
}
