import { localize, type LocalizedString } from "../i18n";
import type { ContentBundle, Question } from "./schemas";

export const ALLOWED_PLACEHOLDERS = ["target", "player:random", "otherPlayer"] as const;

const PLACEHOLDER_RE = /\{([^{}]*)\}/g;

export function placeholdersIn(text: string): string[] {
  return [...text.matchAll(PLACEHOLDER_RE)].map((m) => m[1]);
}

function allTexts(s: LocalizedString): string[] {
  return typeof s === "string" ? [s] : Object.values(s);
}

/**
 * Cross-file checks the zod schemas can't express: unique ids, references between files,
 * valid placeholders, board connectivity. Returns a list of human-readable problems.
 */
export function lintContent(c: ContentBundle): string[] {
  const problems: string[] = [];
  const themeIds = new Set(c.themes.map((t) => t.id));
  const dup = (kind: string, ids: string[]) => {
    const seen = new Set<string>();
    for (const i of ids) {
      if (seen.has(i)) problems.push(`duplicate ${kind} id "${i}"`);
      seen.add(i);
    }
  };
  dup("theme", c.themes.map((t) => t.id));
  dup("pack", c.packs.map((p) => p.id));
  dup("question", c.packs.flatMap((p) => p.questions.map((q) => q.id)));
  dup("tile", c.tiles.map((t) => t.id));
  dup("board", c.boards.map((b) => b.id));
  dup("item", c.items.map((i) => i.id));
  dup("event", c.events.map((e) => e.id));
  dup("bonusStar", c.bonusStars.map((b) => b.id));
  dup("minigame", c.minigames.map((m) => m.id));

  for (const pack of c.packs) {
    for (const q of pack.questions) {
      const where = `${pack.id}/${q.id}`;
      for (const t of q.themes) if (!themeIds.has(t)) problems.push(`${where}: unknown theme "${t}"`);
      for (const text of allTexts(q.prompt)) {
        for (const p of placeholdersIn(text)) {
          if (!(ALLOWED_PLACEHOLDERS as readonly string[]).includes(p))
            problems.push(`${where}: unknown placeholder {${p}}`);
        }
        if (!q.truthSource && !text.includes("{target}") && q.format !== "player")
          problems.push(`${where}: prompt should mention {target}`);
      }
      problems.push(...lintQuestionNumbers(q, where));
      if (q.answers) {
        const labels = q.answers.map((a) => localize(a, pack.language));
        if (new Set(labels).size !== labels.length) problems.push(`${where}: duplicate answers`);
      }
    }
  }

  const tileTypes = new Set(c.tiles.map((t) => t.id));
  for (const b of c.boards) {
    for (const t of b.tiles) if (!tileTypes.has(t.type)) problems.push(`board ${b.id}: tile ${t.id} unknown type ${t.type}`);
    // every tile must be reachable from start and must be able to reach start again (it's a loop)
    const next = new Map(b.tiles.map((t) => [t.id, t.next]));
    const reach = (from: string, graph: Map<string, string[]>) => {
      const seen = new Set([from]);
      const stack = [from];
      while (stack.length) for (const n of graph.get(stack.pop()!) ?? []) if (!seen.has(n)) (seen.add(n), stack.push(n));
      return seen;
    };
    const fwd = reach(b.startTileId, next);
    const rev = new Map<string, string[]>();
    for (const t of b.tiles) for (const n of t.next) rev.set(n, [...(rev.get(n) ?? []), t.id]);
    const back = reach(b.startTileId, rev);
    for (const t of b.tiles) {
      if (!fwd.has(t.id)) problems.push(`board ${b.id}: tile ${t.id} unreachable from start`);
      if (!back.has(t.id)) problems.push(`board ${b.id}: tile ${t.id} is a dead end`);
    }
  }
  return problems;
}

function lintQuestionNumbers(q: Question, where: string): string[] {
  const out: string[] = [];
  if (q.number) {
    const { min, max, step } = q.number;
    const steps = (max - min) / step;
    if (Math.abs(steps - Math.round(steps)) > 1e-6) out.push(`${where}: (max-min) must be a multiple of step`);
    if (q.number.tolerance.type === "relative" && q.number.tolerance.value > 1)
      out.push(`${where}: relative tolerance above 100%`);
  }
  if (q.format === "higherLower" && q.number && q.reference !== undefined) {
    if (q.reference < q.number.min || q.reference > q.number.max) out.push(`${where}: reference outside range`);
  }
  return out;
}
