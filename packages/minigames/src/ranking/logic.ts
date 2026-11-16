import { defineQuestionSeries } from "../kit/questionSeries";

/** Rank 4 things like the target would. One point per correct position. */
export const rankingGame = defineQuestionSeries({
  id: "ranking",
  rounds: (n) => Math.min(3, n + 1),
  formats: ["ranking"],
  allowData: true,
  answerMs: 25000,
  resultsMs: 3500,
  durationSec: 150,
  points: (r) => {
    const out: Record<string, number> = {};
    for (const [pid, pr] of Object.entries(r.result!.perPlayer)) {
      if (pr.isTarget && !r.question.isData) continue;
      out[pid] = Math.round(pr.score * (r.question.options?.length ?? 4));
    }
    return out;
  },
});
