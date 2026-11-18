import { describe, expect, it } from "vitest";
import { createRng, type MinigameServices, type MinigameStepCtx } from "@party-game/shared";
import { content } from "../../shared/test/helpers";
import { MINIGAMES } from "../src/server";
import { MINIGAME_CLIENTS } from "../src/client";
import { accuracy, barPos, rounds as barRounds } from "../src/stop-the-bar/logic";
import { streak } from "../src/higher-lower-cards/logic";
import { levels, replay as oddReplay } from "../src/spot-the-odd/logic";
import { bestLength } from "../src/simon/logic";
import { schedule, whackAMole } from "../src/whack-a-mole/logic";
import { levenshtein, phrase, typeRace } from "../src/type-race/logic";
import { payoutFor, splitOrSteal } from "../src/split-or-steal/logic";
import { mysteryAuction } from "../src/mystery-auction/logic";
import { thinIce, validMoves } from "../src/thin-ice/logic";
import { minefield } from "../src/minefield/logic";
import { musicalChairs } from "../src/musical-chairs/logic";
import { hotPotato } from "../src/hot-potato/logic";
import { rounds as countRounds, countIt } from "../src/count-it/logic";

const services = { coins: { a: 10, b: 3 } } as unknown as MinigameServices;
const ctx = (now: number): MinigameStepCtx => ({ now, rng: createRng(4), services });
const init = (def: any, players = ["a", "b"], bonuses: string[] = [], now = 0) =>
  def.init({ players, bonuses, seed: 77, rng: createRng(3), now, services });

describe("registry completeness", () => {
  it("every enabled mini-game in content has server logic and a client", () => {
    for (const m of content.minigames.filter((x) => x.enabled)) {
      expect(MINIGAMES[m.id], `server ${m.id}`).toBeDefined();
      expect(MINIGAME_CLIENTS[m.id], `client ${m.id}`).toBeDefined();
    }
    expect(Object.keys(MINIGAMES)).toHaveLength(31);
  });
});

describe("solo scoring", () => {
  it("stop-the-bar: dead center = 100, outside = 0, bonus widens", () => {
    const r = barRounds(1)[0];
    expect(accuracy(r.center, r, false)).toBe(100);
    expect(accuracy(r.center + 9, r, false)).toBe(0);
    expect(accuracy(r.center + 9, r, true)).toBeGreaterThan(0);
    expect(barPos(0, r)).toBe(0);
  });
  it("higher-lower: streak stops at the first wrong guess; bonus skip", () => {
    const cards = [5, 9, 2, 2, 13];
    expect(streak(cards, ["h", "l", "h", "h"], false)).toBe(4); // equal counts as correct
    expect(streak(cards, ["l"], false)).toBe(0);
    expect(streak(cards, ["s", "l", "h"], true)).toBe(2);
    expect(streak(cards, ["s", "l"], false)).toBe(0);
  });
  it("spot-the-odd: correct taps level up, wrong taps cost a level", () => {
    const ls = levels(3, false);
    expect(oddReplay(ls, [ls[0].odd, ls[1].odd])).toBe(2);
    expect(oddReplay(ls, [ls[0].odd, (ls[1].odd + 1) % (ls[1].size ** 2)])).toBe(0);
  });
  it("simon: longest completed sequence", () => {
    const seq = [0, 1, 2, 3];
    expect(bestLength(seq, [0, 0, 1, 0, 1, 2])).toBe(3);
    expect(bestLength(seq, [0, 0, 2])).toBe(1);
  });
  it("whack-a-mole: hits score, bombs cost, duplicates ignored", () => {
    const pops = schedule(77);
    const mole = pops.findIndex((p) => !p.bomb);
    const bomb = pops.findIndex((p) => p.bomb);
    let s = init(whackAMole);
    s = whackAMole.onSubmit!(s, "a", { hits: [mole, mole, bomb] }, ctx(0));
    expect(s.scores.a).toBe(1 - 3);
  });
  it("type-race: errors add time, super-human typing is rejected", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3);
    const target = phrase(77, false);
    let s = init(typeRace);
    s = typeRace.onSubmit!(s, "a", { typed: target, timeMs: 9000 }, ctx(0));
    s = typeRace.onSubmit!(s, "b", { typed: target, timeMs: 100 }, ctx(0));
    expect(s.scores.a).toBe(9000);
    expect(s.scores.b).toBeNull();
  });
  it("count-it: total distance from the truth", () => {
    const rs = countRounds(77);
    let s = init(countIt);
    s = countIt.onSubmit!(s, "a", { counts: rs.map((r) => r.answer + 1) }, ctx(0));
    expect(s.scores.a).toBe(3);
  });
});

describe("turn-based & realtime", () => {
  it("split or steal payouts", () => {
    expect(payoutFor("split", "split")).toEqual([5, 5]);
    expect(payoutFor("steal", "split")).toEqual([10, 0]);
    expect(payoutFor("steal", "steal")).toEqual([0, 0]);
    let s = init(splitOrSteal, ["a", "b"], ["a"]);
    s = splitOrSteal.onInput!(s, "b", { choice: "steal" }, ctx(5000));
    expect((splitOrSteal.privateState!(s, "a", 5000) as any).otherSlow).toBe(true);
    s = splitOrSteal.onInput!(s, "a", { choice: "split" }, ctx(5100));
    s = splitOrSteal.tick!(s, ctx(5200));
    expect(splitOrSteal.payout!(s, [])).toEqual({ a: 0, b: 10 });
    expect(splitOrSteal.maxPlayers).toBe(2);
  });
  it("mystery auction: bids capped by coins, highest bid pays and wins", () => {
    let s = init(mysteryAuction);
    s = mysteryAuction.onInput!(s, "b", { bids: [5, 0, 0] }, ctx(10)); // b only has 3 coins
    expect(s.locked).not.toContain("b");
    s = mysteryAuction.onInput!(s, "b", { bids: [3, 0, 0] }, ctx(10));
    s = mysteryAuction.onInput!(s, "a", { bids: [4, 0, 1] }, ctx(20));
    s = mysteryAuction.tick!(s, ctx(30));
    expect(s.winners).toEqual(["a", null, "a"]);
    expect(mysteryAuction.payout!(s, []).a).toBe(s.contents[0] - 4 + s.contents[2] - 1);
  });
  it("thin ice: tiles break behind you, stuck players fall in", () => {
    let s = init(thinIce);
    const pid = s.alive[s.turn];
    const from = s.pos[pid];
    const to = validMoves(s, pid)[0];
    s = thinIce.onInput!(s, pid, { cell: to }, ctx(100));
    expect(s.broken).toContain(from);
    expect(s.pos[pid]).toBe(to);
    // surround the other player with holes → they fall in on their turn
    const other = s.alive.find((p: string) => p !== pid)!;
    s = { ...s, broken: [...s.broken, ...validMoves(s, other)] };
    s = thinIce.tick!(s, ctx(1e9));
    expect(s.alive).toEqual([pid]);
    expect(thinIce.results(s)[0].playerId).toBe(pid);
  });
  it("minefield: hitting the bomb eliminates", () => {
    let s = init(minefield);
    const cur = s.alive[s.turn];
    s = minefield.onInput!(s, cur, { tile: s.bomb }, ctx(10));
    expect(s.out).toEqual([cur]);
    expect(minefield.isFinished(s, 1e9)).toBe(true);
    expect(JSON.stringify(minefield.publicState(init(minefield), 0))).not.toContain('"bomb"');
  });
  it("musical chairs: no chair = out; bonus sees chairs early", () => {
    let s = init(musicalChairs, ["a", "b", "c"], ["c"]);
    expect(musicalChairs.privateState!(s, "c", s.stopAt - 100) as any).toMatchObject({ earlyChairs: s.chairs });
    expect((musicalChairs.privateState!(s, "a", s.stopAt - 100) as any).earlyChairs).toBeNull();
    s = musicalChairs.onInput!(s, "c", { chair: 0 }, ctx(s.stopAt - 100)); // bonus early grab
    s = musicalChairs.tick!(s, ctx(s.stopAt));
    s = musicalChairs.onInput!(s, "a", { chair: 0 }, ctx(s.stopAt + 10)); // taken
    s = musicalChairs.onInput!(s, "a", { chair: 1 }, ctx(s.stopAt + 20));
    s = musicalChairs.tick!(s, ctx(s.stopAt + 30));
    expect(s.out).toEqual(["b"]);
  });
  it("hot potato: right answer passes the bomb, fuse eliminates the holder", () => {
    let s = init(hotPotato);
    const holder = s.holder;
    s = hotPotato.onInput!(s, holder, { choice: s.prompt.answer }, ctx(10));
    expect(s.holder).not.toBe(holder);
    const victim = s.holder;
    s = hotPotato.tick!(s, ctx(s.explodeAt));
    expect(s.out).toEqual([victim]);
  });
});
