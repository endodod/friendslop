import { describe, expect, it } from "vitest";
import { RANDOM_BOARD_ID, createRng, resolveBoardId, updateSettings, createRoom } from "../src";
import { content } from "./helpers";

describe("random map", () => {
  it("is a valid setting and resolves to a shipped board", () => {
    const room = updateSettings(createRoom("ABCD", 0, content), { boardId: RANDOM_BOARD_ID }, content);
    expect(room.settings.boardId).toBe(RANDOM_BOARD_ID);
    const ids = new Set(content.boards.map((b) => b.id));
    const rng = createRng(3);
    const picked = new Set(Array.from({ length: 50 }, () => resolveBoardId(content, RANDOM_BOARD_ID, rng)));
    for (const id of picked) expect(ids.has(id)).toBe(true);
    expect(picked.size).toBeGreaterThan(1);
    expect(resolveBoardId(content, "classic", rng)).toBe("classic");
    expect(ids.has("quick")).toBe(false);
  });
});
