import { describe, expect, it } from "vitest";
import { addPlayer, createRoom, setPlayerProfile } from "../src";
import { content } from "./helpers";

describe("player icons", () => {
  it("stores a valid icon, ignores unknown ones on join, rejects them on profile change", () => {
    let room = createRoom("ABCD", 0, content);
    room = addPlayer(room, { id: "a", name: "Ann", avatar: "🦊", now: 0 });
    room = addPlayer(room, { id: "b", name: "Bob", avatar: "not-an-icon", now: 0 });
    expect(room.players[0].avatar).toBe("🦊");
    expect(room.players[1].avatar).toBeNull();
    room = setPlayerProfile(room, "b", { avatar: "🤖" });
    expect(room.players[1].avatar).toBe("🤖");
    room = setPlayerProfile(room, "b", { avatar: null });
    expect(room.players[1].avatar).toBeNull();
    expect(() => setPlayerProfile(room, "b", { avatar: "<b>" })).toThrow();
  });
});
