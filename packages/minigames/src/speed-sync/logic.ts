import { defineQuestionSeries } from "../kit/questionSeries";

export const ANSWER_MS = 8000;

/** 5 quick tile questions. Matching scores 2, answering in the first half of the window +1; targets get 1 per matcher. */
export const speedSync = defineQuestionSeries({
  id: "speed-sync",
  rounds: () => 5,
  formats: ["tiles"],
  answerMs: ANSWER_MS,
  durationSec: 120,
  points: (r) => {
    const out: Record<string, number> = {};
    const res = r.result!;
    const opened = r.answeringStartedAt ?? 0;
    for (const [pid, pr] of Object.entries(res.perPlayer)) {
      if (pr.isTarget) {
        out[pid] = res.matchedCount;
        continue;
      }
      if (!pr.match) continue;
      // speed bonus: answered within the first half of the answer window
      const t = r.answeredAt[pid] ?? Infinity;
      out[pid] = 2 + (t - opened <= ANSWER_MS / 2 ? 1 : 0);
    }
    return out;
  },
});
