"use client";
import { motion } from "framer-motion";
import type { MinigameClientProps } from "../kit/types";
import { Arena, ChunkyButton, Hud, Pill, RoundDots, ScoreStrip } from "../kit/visual";
import { PICK_MS } from "./logic";

interface Pub {
  round: number;
  total: number;
  phase: "pick" | "reveal" | "done";
  phaseEndsAt: number;
  max: number;
  locked: string[];
  revealed: Record<string, number>[];
  winners: (string | null)[];
  points: Record<string, number>;
}

export function LoneWolfClient(p: MinigameClientProps<Pub, { myPick: number | null; bonus: boolean }>) {
  const { pub } = p;
  const showRound = pub.phase === "pick" ? pub.round : Math.min(pub.round, pub.total - 1);
  const picks = pub.phase !== "pick" ? pub.revealed[showRound] ?? {} : null;
  const winner = pub.phase !== "pick" ? pub.winners[showRound] : undefined;
  const byNumber = new Map<number, string[]>();
  if (picks) for (const [pid, n] of Object.entries(picks)) byNumber.set(n, [...(byNumber.get(n) ?? []), pid]);
  const myPick = p.priv?.myPick ?? null;
  return (
    <div className="flex flex-col gap-4">
      <Hud
        left={<RoundDots total={pub.total} done={pub.phase === "pick" ? pub.round : pub.round + 1} />}
        right={p.priv?.bonus ? <Pill tone="#ffc933">Bonus: wins count double</Pill> : undefined}
      />
      {pub.phase === "pick" && <p.ui.Timer endsAt={pub.phaseEndsAt} totalMs={PICK_MS} />}
      <Arena tone={pub.phase === "pick" ? "#7b5cff" : winner ? "#2fd27a" : "#ff4d5e"} className="flex flex-col items-center gap-3 p-4" pattern="stripes">
        <p className="text-center font-display text-2xl">
          {pub.phase === "pick"
            ? "Pick the lowest number nobody else picks"
            : winner
              ? `${p.players[winner]?.name ?? "?"} is the lone wolf!`
              : "No lone wolf this round"}
        </p>
        <div className="grid w-full grid-cols-5 gap-2">
          {Array.from({ length: pub.max }, (_, i) => i + 1).map((n) => {
            const who = byNumber.get(n) ?? [];
            const won = winner && who.length === 1 && who[0] === winner;
            const clash = who.length > 1;
            const mine = myPick === n && pub.phase === "pick";
            const canPick = p.isParticipant && pub.phase === "pick" && myPick === null;
            return (
              <motion.div key={n} layout className="flex flex-col items-center gap-1">
                <ChunkyButton
                  color={won ? "#2fd27a" : clash ? "#ff4d5e" : mine ? "#ffc933" : "#3a3462"}
                  textColor={won || mine ? "#14112a" : "#f4f1ff"}
                  disabled={!canPick && !mine && !picks}
                  className="aspect-square w-full text-3xl"
                  onClick={() => {
                    if (!canPick) return;
                    p.ui.play("click");
                    p.input({ pick: n });
                  }}
                  testId={`wolf-${n}`}
                >
                  {n}
                </ChunkyButton>
                <div className="flex min-h-6 flex-wrap justify-center -space-x-2">
                  {who.map((pid) => (
                    <p.ui.Avatar key={pid} player={p.players[pid]} size={22} dim={clash} />
                  ))}
                </div>
              </motion.div>
            );
          })}
        </div>
        {pub.phase === "pick" && (
          <p className="text-sm text-muted">
            {myPick !== null ? `You picked ${myPick}. ` : ""}
            Locked in: {pub.locked.length}/{p.participants.length}
          </p>
        )}
      </Arena>
      <ScoreStrip participants={p.participants} points={pub.points} renderAvatar={(pid) => <p.ui.Avatar player={p.players[pid]} size={28} />} />
      <p className="text-center text-sm text-muted">Same number as someone else? You both cancel out. The lowest number left standing wins.</p>
    </div>
  );
}
