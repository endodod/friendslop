import type { PlayerDataBundle, RoomState } from "@party-game/shared";

export interface Seat {
  token: string;
  role: "player" | "display";
  playerId: string | null;
  profileId: string | null;
}

/** Everything the server keeps per room. Live state stays in memory. */
export interface RoomRecord {
  room: RoomState;
  seats: Map<string, Seat>;
  /** Linked data per player (server-only). */
  playerData: Record<string, PlayerDataBundle>;
  seed: number;
  rngState: number;
  lastActivity: number;
}

/**
 * Storage for live rooms. In-memory for one process; implement this interface with Redis
 * to run several game server instances.
 */
export interface RoomStore {
  get(code: string): RoomRecord | undefined;
  set(code: string, rec: RoomRecord): void;
  delete(code: string): void;
  has(code: string): boolean;
  all(): IterableIterator<RoomRecord>;
}

export class InMemoryRoomStore implements RoomStore {
  private rooms = new Map<string, RoomRecord>();
  get(code: string) {
    return this.rooms.get(code);
  }
  set(code: string, rec: RoomRecord) {
    this.rooms.set(code, rec);
  }
  delete(code: string) {
    this.rooms.delete(code);
  }
  has(code: string) {
    return this.rooms.has(code);
  }
  all() {
    return this.rooms.values();
  }
}
