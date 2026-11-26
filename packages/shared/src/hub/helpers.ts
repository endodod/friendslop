import { GAME_CONFIG } from "../config/game";
import type { PlayerId } from "../engine/types";
import type { HubCtx, HubPhaseState, HubPlacement } from "./types";

/** How long someone who has to act may be gone before the game acts for them. */
export const HUB_AUTOPLAY_MS = GAME_CONFIG.timers.disconnectedAutoplayMs;

export function setPhase<S extends HubPhaseState>(state: S, phase: S["phase"], ms: number | null, ctx: HubCtx) {
  state.phase = phase;
  state.phaseStartedAt = ctx.now;
  state.phaseEndsAt = ms === null ? null : ctx.now + ms;
  ctx.emit({ type: "hubPhase", phase });
}

/** Player-typed text: no control characters, single spaces, trimmed, at most `max` characters. */
export function cleanText(raw: string, max: number): string {
  return raw
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
    .trim();
}

/** For comparing answers: lower case, letters and digits only, no leading article. */
export function normalizeAnswer(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/^(a|an|the|my|his|her|their) /, "")
    .replace(/ /g, "");
}

/** Ranking by score, highest first; equal scores share a rank. */
export function hubRanking(scores: Record<PlayerId, number>, players: PlayerId[]): HubPlacement[] {
  const sorted = [...players].sort((a, b) => (scores[b] ?? 0) - (scores[a] ?? 0));
  const out: HubPlacement[] = [];
  sorted.forEach((pid, i) => {
    const score = scores[pid] ?? 0;
    const rank = i > 0 && out[i - 1].score === score ? out[i - 1].rank : i + 1;
    out.push({ playerId: pid, rank, score });
  });
  return out;
}

/** Players who have been gone at least HUB_AUTOPLAY_MS. */
export function goneLong(ctx: HubCtx, pid: PlayerId): boolean {
  const since = ctx.disconnectedSince(pid);
  return since !== null && ctx.now - since >= HUB_AUTOPLAY_MS;
}

/** Still counted as playing: connected, or only gone briefly (a refresh or network blip). */
export function present(ctx: HubCtx, pid: PlayerId): boolean {
  return !goneLong(ctx, pid);
}

export function pickRandom<T>(rng: () => number, xs: readonly T[]): T | undefined {
  return xs.length ? xs[Math.floor(rng() * xs.length)] : undefined;
}

/** For comparing single words: `normalizeAnswer` plus a light plural/verb-ending strip ("fishes" = "fish"). */
export function wordKey(text: string): string {
  const n = normalizeAnswer(text);
  if (n.length > 5 && n.endsWith("ing")) return n.slice(0, -3);
  if (n.length > 4 && n.endsWith("es")) return n.slice(0, -2);
  if (n.length > 4 && n.endsWith("ed")) return n.slice(0, -2);
  if (n.length > 3 && n.endsWith("s") && !n.endsWith("ss")) return n.slice(0, -1);
  return n;
}

/** Edit distance (insert, delete, replace), for forgiving small typos. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}
