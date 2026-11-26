"use client";
import { motion } from "framer-motion";
import { ArrowDown, ArrowUp, Lock } from "lucide-react";
import { useEffect, useState } from "react";
import type { Answer } from "@party-game/shared";
import type { MinigameClientProps } from "../kit/types";
import { Arena, ChunkyButton, Pill, RoundDots, ScoreStrip } from "../kit/visual";
import { GUESS_MS, TARGET_MS, type HotOrNotPublic } from "./logic";

export function HotOrNotClient(p: MinigameClientProps<HotOrNotPublic, { myGuess: "higher" | "lower" | null; myTruth: number | null }>) {
  const r = p.pub.round;
  const [draft, setDraft] = useState<Answer | null>(null);
  useEffect(() => setDraft(null), [p.pub.index]);
  // Target forgot to lock in: their current number counts.
  useEffect(() => {
    const r = p.pub.round;
    if (!r || r.stage !== "target" || !r.stageEndsAt || p.me !== r.targetId || p.priv?.myTruth != null || !draft) return;
    const t = setTimeout(() => p.input({ answer: draft }), Math.max(0, r.stageEndsAt - p.now() - 700));
    return () => clearTimeout(t);
  }, [p, draft]);
  if (!r) return <p className="text-center text-muted">Wrapping up…</p>;
  const target = p.players[r.targetId];
  const isTarget = p.me === r.targetId;
  const canGuess = p.isParticipant && (!isTarget || r.question.isData);
  const unit = r.question.number?.unit;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-center">
        <RoundDots total={p.pub.total} done={p.pub.index} />
      </div>
      <Arena tone="#ff8a3d" className="flex items-start gap-3 p-4" pattern="none">
        <p.ui.Avatar player={target} size={48} ring />
        <h2 className="font-display text-2xl leading-tight">{r.question.prompt}</h2>
      </Arena>
      {r.question.number && (r.question.number.minLabel || r.question.number.maxLabel) && (
        <p.ui.ScaleEnds min={r.question.number.min} max={r.question.number.max} minLabel={r.question.number.minLabel} maxLabel={r.question.number.maxLabel} />
      )}

      {r.stage === "intro" && (
        <motion.p initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center font-display text-3xl">
          About {target?.name}…
        </motion.p>
      )}

      {r.stage === "target" &&
        (isTarget ? (
          <div className="flex flex-col gap-3">
            <p.ui.Timer endsAt={r.stageEndsAt} totalMs={TARGET_MS} />
            <p className="font-display text-lg text-accent">Answer honestly. Everyone else guesses higher or lower!</p>
            {p.priv?.myTruth == null ? (
              <>
                <p.ui.AnswerInput question={r.question} value={draft} onChange={setDraft} />
                <ChunkyButton color="#ffc933" className="flex min-h-14 items-center justify-center gap-2 text-2xl" disabled={!draft} onClick={() => draft && p.input({ answer: draft })}>
                  <Lock size={20} /> Lock in
                </ChunkyButton>
              </>
            ) : (
              <p className="text-center font-display text-2xl">Locked: {p.priv.myTruth}</p>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <p.ui.Timer endsAt={r.stageEndsAt} totalMs={TARGET_MS} />
            <p className="flex items-center justify-center gap-2 text-center font-display text-xl text-muted">
              <motion.span animate={{ rotate: [0, -10, 10, 0] }} transition={{ repeat: Infinity, duration: 1.2 }}>🤫</motion.span>
              {target?.name} is answering secretly…
            </p>
          </div>
        ))}

      {(r.stage === "guess" || r.stage === "reveal") && (
        <div className="flex flex-col items-center gap-3">
          <p className="font-display text-lg text-muted">Is the real answer higher or lower than</p>
          <motion.div
            initial={{ scale: 2, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="rounded-[28px] px-8 py-3"
            style={{ background: "radial-gradient(circle at 50% 30%, #ffc93344, #ffc93311)", boxShadow: "inset 0 0 0 2px #ffc933aa, 0 0 40px #ffc93333" }}
          >
            <span className="font-display text-7xl text-accent">{r.reference}</span>
            {unit && <span className="ml-2 font-display text-2xl text-muted">{unit}</span>}
          </motion.div>
          {r.stage === "guess" && (
            <>
              <div className="w-full">
                <p.ui.Timer endsAt={r.stageEndsAt} totalMs={GUESS_MS} />
              </div>
              {canGuess && !p.priv?.myGuess && (
                <div className="grid w-full grid-cols-2 gap-3">
                  <ChunkyButton color="#2fd27a" textColor="#06210f" className="flex min-h-24 flex-col items-center justify-center text-2xl" onClick={() => p.input({ dir: "higher" })}>
                    <ArrowUp size={34} /> Higher
                  </ChunkyButton>
                  <ChunkyButton color="#ff4d5e" textColor="#fff" className="flex min-h-24 flex-col items-center justify-center text-2xl" onClick={() => p.input({ dir: "lower" })}>
                    <ArrowDown size={34} /> Lower
                  </ChunkyButton>
                </div>
              )}
              {p.priv?.myGuess && (
                <Pill tone={p.priv.myGuess === "higher" ? "#2fd27a" : "#ff4d5e"}>
                  You said {p.priv.myGuess} {p.priv.myGuess === "higher" ? "↑" : "↓"}
                </Pill>
              )}
              {isTarget && !r.question.isData && <p className="text-muted">You know the answer. Watch them sweat.</p>}
            </>
          )}
          {r.stage === "reveal" && (
            <motion.div initial={{ rotateX: 90 }} animate={{ rotateX: 0 }} className="flex w-full flex-col items-center gap-2">
              <p className="font-display text-xl">{r.question.isData ? "The real answer:" : `${target?.name} said:`}</p>
              <p className="flex items-center gap-3 font-display text-6xl">
                {r.truth! > r.reference! ? <ArrowUp size={40} className="text-good" /> : r.truth! < r.reference! ? <ArrowDown size={40} className="text-bad" /> : null}
                {r.truth}
                {unit && <span className="text-2xl text-muted">{unit}</span>}
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {Object.entries(r.guesses ?? {}).map(([pid, dir], i) => {
                  const ok = (dir === "higher") === (r.truth! > r.reference!);
                  return (
                    <motion.span
                      key={pid}
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: 0.3 + i * 0.15 }}
                      className={`flex items-center gap-1 rounded-full px-2 py-1 font-display ${ok ? "bg-good/30 ring-1 ring-good" : "bg-bad/30 ring-1 ring-bad"}`}
                    >
                      <p.ui.Avatar player={p.players[pid]} size={26} /> {dir === "higher" ? "↑" : "↓"} {ok ? "✓" : "✗"}
                    </motion.span>
                  );
                })}
              </div>
            </motion.div>
          )}
        </div>
      )}

      <ScoreStrip participants={p.participants} points={p.pub.points} renderAvatar={(pid) => <p.ui.Avatar player={p.players[pid]} size={28} />} />
    </div>
  );
}
