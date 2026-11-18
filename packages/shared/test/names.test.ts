import { describe, expect, it } from "vitest";
import { CURSED_DICE_MAX, isOffensiveName, setPlayerProfile } from "../src";
import { Harness } from "./helpers";

describe("offensive names", () => {
  it("catches slurs, hate references and swearing, also disguised", () => {
    for (const n of ["nigger", "N.i.g.g.3.r", "niiiiggaaa", "xXn1gg4Xx", "faggot", "c00n", "the coon", "Hitler", "sieg heil", "1488", "14/88", "FuckYou", "sh1thead", "Hurensohn", "Scheiße", "dick", "SpiC"])
      expect(isOffensiveName(n), n).toBe(true);
  });

  it("leaves normal names alone", () => {
    for (const n of ["Sam", "Raccoon", "Scunthorpe", "Niger", "Nigeria", "Japan", "Spice", "Dickens", "Cocktail", "Ashkenazi", "Nazim", "Fukushima", "Sniggers", "Shiitake", "Mongoose", "Abbey", "Siegfried", "Jude", "Heiligenstadt", "Pakistan", ""])
      expect(isOffensiveName(n), n).toBe(false);
  });
});

describe("cursed dice", () => {
  it("cursed players keep their name but only roll 1–3, renaming lifts it", () => {
    const h = new Harness(2);
    h.room = { ...h.room, players: h.room.players.map((p) => (p.id === "p1" ? { ...p, cursed: true } : p)) };
    h.advanceTo("turnStart");
    while (h.active() !== "p1") {
      h.act({ type: "roll", playerId: h.active() });
      h.advanceTo("turnStart");
    }
    for (let i = 0; i < 30; i++) {
      const g = h.g;
      g.phase = "turnStart";
      h.act({ type: "roll", playerId: "p1" });
      expect(h.g.dice!.values.every((v) => v >= 1 && v <= CURSED_DICE_MAX)).toBe(true);
    }
  });

  it("is set from the name and cleared by a clean rename in the lobby", () => {
    const h = new Harness(2);
    let room = h.room;
    room = setPlayerProfile({ ...room, stage: "lobby", game: null }, "p1", { name: "n1gger" });
    expect(room.players.find((p) => p.id === "p1")!.cursed).toBe(true);
    room = setPlayerProfile(room, "p1", { name: "Samwise" });
    expect(room.players.find((p) => p.id === "p1")!.cursed).toBe(false);
  });
});
