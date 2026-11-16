import { fail } from "@party-game/shared";
import type { LiveRoom, RoomManager } from "../rooms/manager";

export async function linkSteam(_rooms: RoomManager, _rec: LiveRoom, _playerId: string, _profileId: string | null, _profile: string) {
  fail("PROVIDER_ERROR", "Steam linking is not available yet.");
}

export async function unlinkProvider(_rooms: RoomManager, _rec: LiveRoom, _playerId: string, _profileId: string | null, _provider: string) {
  fail("PROVIDER_ERROR", "Nothing to unlink.");
}
