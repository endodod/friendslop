"use client";
import type { Answer } from "@party-game/shared";
import type { MinigameClientProps } from "./types";
import type { SeriesPublic } from "./questionSeries";
import { RoundDots, ScoreStrip } from "./visual";

/** Generic client for question-series mini-games: round counter, question UI, scoreboard. */
export function SeriesClient(p: MinigameClientProps<SeriesPublic, { myAnswer: Answer | null }>) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-center gap-3">
        <span className="font-display text-lg text-muted">
          Question {Math.min(p.pub.index + 1, p.pub.total)}/{p.pub.total}
        </span>
        <RoundDots total={p.pub.total} done={Math.min(p.pub.index, p.pub.total)} />
      </div>
      {p.pub.round && (
        <p.ui.QuestionRound
          round={p.pub.round}
          display={p.display}
          myAnswer={p.priv?.myAnswer ?? null}
          onAnswer={async (answer) => p.input({ answer })}
          totalAnswerMs={p.pub.answerMs ?? undefined}
        />
      )}
      <ScoreStrip
        participants={p.participants}
        points={p.pub.points}
        lastGain={p.pub.lastGain}
        renderAvatar={(pid) => <p.ui.Avatar player={p.players[pid]} size={28} />}
      />
    </div>
  );
}
