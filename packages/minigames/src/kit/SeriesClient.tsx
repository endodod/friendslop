"use client";
import type { Answer } from "@party-game/shared";
import type { MinigameClientProps } from "./types";
import type { SeriesPublic } from "./questionSeries";

/** Generic client for question-series mini-games: round counter, question UI, scoreboard. */
export function SeriesClient(p: MinigameClientProps<SeriesPublic, { myAnswer: Answer | null }>) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-center text-muted">
        Question {Math.min(p.pub.index + 1, p.pub.total)}/{p.pub.total}
      </p>
      {p.pub.round && (
        <p.ui.QuestionRound
          round={p.pub.round}
          display={p.display}
          myAnswer={p.priv?.myAnswer ?? null}
          onAnswer={async (answer) => p.input({ answer })}
          totalAnswerMs={p.pub.answerMs}
        />
      )}
      <ul className="flex flex-wrap justify-center gap-3">
        {p.participants.map((pid) => (
          <li key={pid} className="flex items-center gap-1 font-display text-lg">
            <p.ui.Avatar player={p.players[pid]} size={30} />
            {p.pub.points[pid] ?? 0}
            {(p.pub.lastGain[pid] ?? 0) > 0 && <span className="text-sm text-accent">+{p.pub.lastGain[pid]}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
