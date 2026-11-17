import { describe, expect, it } from "vitest";
import { removePlayerFromGame } from "../src";
import { Harness } from "./helpers";

function kick(h: Harness, pid: string) {
  const res = removePlayerFromGame(h.room, pid, h.ctx());
  h.room = res.room;
}

describe("removing a player mid-game", () => {
  it("someone else's turn keeps going; they're gone from order, players and room", () => {
    const h = new Harness(3);
    h.advanceTo("turnStart");
    const active = h.active();
    const other = h.g.order.find((p) => p !== active)!;
    kick(h, other);
    expect(h.g.phase).toBe("turnStart");
    expect(h.active()).toBe(active);
    expect(h.g.order).not.toContain(other);
    expect(h.g.players[other]).toBeUndefined();
    expect(h.room.players.some((p) => p.id === other)).toBe(false);
  });

  it("their own turn is skipped and the next player is up", () => {
    const h = new Harness(3);
    h.advanceTo("turnStart");
    const [first, second] = h.g.order;
    expect(h.active()).toBe(first);
    kick(h, first);
    expect(h.g.phase).toBe("turnEnd");
    h.timeout();
    expect(h.g.phase).toBe("turnStart");
    expect(h.active()).toBe(second);
  });

  it("the last player in the order: the round ends normally", () => {
    const h = new Harness(3);
    h.advanceTo("turnStart");
    h.room.game!.activeIndex = 2;
    const last = h.g.order[2];
    kick(h, last);
    h.timeout();
    expect(h.g.phase).toBe("roundEnd");
  });

  it("a question about them is dropped; a guesser leaving can end answering early", () => {
    const h = new Harness(3, { mode: "questionDebug" });
    h.timeout(); // intro
    h.timeout(); // answering
    const q = h.g.question!;
    const guessers = q.participants.filter((p) => p !== q.targetId);
    const qq = q.question;
    const ans =
      qq.format === "tiles" ? { kind: "option" as const, optionId: qq.options![0].id }
      : qq.format === "player" ? { kind: "player" as const, playerId: qq.playerChoices![0] }
      : qq.format === "higherLower" ? { kind: "hl" as const, dir: "higher" as const }
      : qq.format === "ranking" ? { kind: "order" as const, optionIds: qq.options!.map((o) => o.id) }
      : { kind: "number" as const, value: qq.number!.min };
    h.act({ type: "answer", playerId: q.targetId, answer: ans });
    h.act({ type: "answer", playerId: guessers[0], answer: ans });
    kick(h, guessers[1]);
    expect(h.g.question!.stage).toBe("reveal");
    expect(h.g.question!.participants).not.toContain(guessers[1]);
  });

  it("down to one player: the game ends", () => {
    const h = new Harness(2);
    h.advanceTo("turnStart");
    kick(h, h.g.order[1]);
    expect(h.g.phase).toBe("podium");
  });

  it("a game keeps working after a player was removed", () => {
    const h = new Harness(4, { seed: 77 });
    h.room.game!.turnCount = 3;
    h.advanceTo("turnStart");
    kick(h, h.g.order[1]);
    let guard = 0;
    while (h.g.phase !== "podium" && guard++ < 3000) h.timeout();
    expect(h.g.phase).toBe("podium");
    expect(h.g.finalRanking).toHaveLength(3);
  });
});
