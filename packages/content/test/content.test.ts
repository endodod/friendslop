import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { lintContent, parseContent, placeholdersIn } from "@party-game/shared";
import { loadContent, readRawContent } from "../src/node";

const ICON_DIR = join(__dirname, "../../../apps/web/public/icons");

describe("content lint", () => {
  const content = loadContent();

  it("parses and passes all cross-file checks", () => {
    expect(lintContent(content)).toEqual([]);
  });

  it("ships the required themes", () => {
    const ids = content.themes.map((t) => t.id);
    for (const t of ["food", "music", "gaming", "movies", "life", "hypotheticals", "hot-takes"]) expect(ids).toContain(t);
  });

  it("has enough questions per theme", () => {
    for (const theme of content.themes) {
      const n = content.packs.flatMap((p) => p.questions).filter((q) => q.themes.includes(theme.id) && !q.truthSource).length;
      expect(n, `theme ${theme.id}`).toBeGreaterThanOrEqual(8);
    }
  });

  it("tiles questions have 2–6 answers, ranking 3–4", () => {
    for (const q of content.packs.flatMap((p) => p.questions)) {
      if (q.truthSource) continue;
      if (q.format === "tiles") expect(q.answers!.length).toBeGreaterThanOrEqual(2);
      if (q.format === "tiles") expect(q.answers!.length).toBeLessThanOrEqual(6);
      if (q.format === "ranking") expect([3, 4]).toContain(q.answers!.length);
    }
  });

  it("number ranges are valid", () => {
    for (const q of content.packs.flatMap((p) => p.questions)) {
      if (!q.number) continue;
      expect(q.number.min, q.id).toBeLessThan(q.number.max);
      expect(q.number.step, q.id).toBeGreaterThan(0);
    }
  });

  it("every referenced icon exists", () => {
    const icons = [
      ...content.themes.map((t) => t.icon),
      ...content.tiles.map((t) => t.icon),
      ...content.items.map((t) => t.icon),
      ...content.events.map((t) => t.icon),
      ...content.bonusStars.map((t) => t.icon),
      ...content.minigames.map((t) => t.icon),
    ];
    for (const icon of icons) expect(existsSync(join(ICON_DIR, `${icon}.svg`)), `icon ${icon}`).toBe(true);
  });

  it("catches mistakes: duplicate ids, bad placeholders, unknown themes, bad answer counts", () => {
    const raw = readRawContent();
    const pack = structuredClone(raw.packs[0].data) as any;
    pack.id = "broken-pack";
    pack.questions = [
      { ...pack.questions[0] }, // duplicate id
      { id: "broken.placeholder", themes: ["food"], format: "tiles", prompt: "What does {targt} like?", answers: ["a", "b"], usage: ["tile"] },
      { id: "broken.theme", themes: ["nope"], format: "tiles", prompt: "{target}?", answers: ["a", "b"], usage: ["tile"] },
    ];
    expect(() => parseContent({ ...raw, packs: [...raw.packs, { file: "broken.json", data: pack }] })).toThrow(
      /duplicate question id[\s\S]*unknown placeholder \{targt\}[\s\S]*unknown theme "nope"/,
    );
    const onlyOne = { id: "x", name: "x", language: "en", questions: [{ id: "x.one", themes: ["food"], format: "tiles", prompt: "{target}", answers: ["only"], usage: ["tile"] }] };
    expect(() => parseContent({ ...raw, packs: [{ file: "x.json", data: onlyOne }] })).toThrow(/2–6 answers/);
  });

  it("placeholder parser", () => {
    expect(placeholdersIn("{target} and {player:random}")).toEqual(["target", "player:random"]);
  });
});
