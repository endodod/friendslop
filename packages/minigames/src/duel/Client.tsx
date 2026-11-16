"use client";
import type { Answer } from "@party-game/shared";
import type { MinigameClientProps } from "../kit/types";
import type { DuelPublic } from "./logic";

export function DuelClient(p: MinigameClientProps<DuelPublic, { myAnswer: Answer | null }>) {
  const [c, o] = p.pub.duelists;
  if (!p.pub.round) return <p className="text-center text-muted">{p.pub.reason}</p>;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-center gap-3 font-display text-2xl">
        <p.ui.Avatar player={p.players[c]} size={44} ring={p.pub.winner === c} />
        <p.ui.Icon id="duel" size={32} className="text-accent" />
        <p.ui.Avatar player={p.players[o]} size={44} ring={p.pub.winner === o} />
      </div>
      <p.ui.QuestionRound
        round={p.pub.round}
        display={p.display}
        myAnswer={p.priv?.myAnswer ?? null}
        onAnswer={async (answer) => p.input({ answer })}
        totalAnswerMs={15000}
      />
      {p.pub.reason && (
        <p className="rounded-2xl bg-accent/20 p-3 text-center font-display text-2xl">
          {p.pub.reason}
          {p.pub.winner && p.pub.loser && (
            <span className="block text-lg text-accent">
              {p.players[p.pub.winner]?.name} steals 5 coins from {p.players[p.pub.loser]?.name}!
            </span>
          )}
        </p>
      )}
    </div>
  );
}
