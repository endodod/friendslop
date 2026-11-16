"use client";
import { motion } from "framer-motion";
import { ArrowDown, ArrowUp, Lock } from "lucide-react";
import { useEffect, useState } from "react";
import type { Answer } from "@party-game/shared";
import type { MinigameClientProps } from "../kit/types";
import { GUESS_MS, TARGET_MS, type HotOrNotPublic } from "./logic";

export function HotOrNotClient(p: MinigameClientProps<HotOrNotPublic, { myGuess: "higher" | "lower" | null; myTruth: number | null }>) {
  const r = p.pub.round;
  const [draft, setDraft] = useState<Answer | null>(null);
  useEffect(() => setDraft(null), [p.pub.index]);
  if (!r) return <p className="text-center text-muted">Wrapping up…</p>;
  const target = p.players[r.targetId];
  const isTarget = p.me === r.targetId;
  const canGuess = p.isParticipant && (!isTarget || r.question.isData);
  const unit = r.question.number?.unit;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-center text-muted">
        Round {p.pub.index + 1}/{p.pub.total}
      </p>
      <div className="flex items-start gap-3">
        <p.ui.Avatar player={target} size={48} ring />
        <h2 className="font-display text-2xl leading-tight">{r.question.prompt}</h2>
      </div>

      {r.stage === "intro" && <p className="text-center font-display text-3xl">About {target?.name}…</p>}

      {r.stage === "target" &&
        (isTarget ? (
          <div className="flex flex-col gap-3">
            <p.ui.Timer endsAt={r.stageEndsAt} totalMs={TARGET_MS} />
            <p className="font-display text-lg text-accent">Answer honestly. Everyone else guesses higher or lower!</p>
            {p.priv?.myTruth == null ? (
              <>
                <p.ui.AnswerInput question={r.question} value={draft} onChange={setDraft} />
                <button className="btn-primary min-h-14 text-2xl" disabled={!draft} onClick={() => draft && p.input({ answer: draft })}>
                  <Lock size={20} /> Lock in
                </button>
              </>
            ) : (
              <p className="text-center font-display text-2xl">Locked: {p.priv.myTruth}</p>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <p.ui.Timer endsAt={r.stageEndsAt} totalMs={TARGET_MS} />
            <p className="text-center font-display text-xl text-muted">{target?.name} is answering secretly…</p>
          </div>
        ))}

      {(r.stage === "guess" || r.stage === "reveal") && (
        <div className="flex flex-col items-center gap-3">
          <p className="font-display text-lg text-muted">Is the real answer higher or lower than</p>
          <motion.p initial={{ scale: 2 }} animate={{ scale: 1 }} className="font-display text-7xl text-accent">
            {r.reference}
            {unit && <span className="ml-2 text-2xl text-muted">{unit}</span>}
          </motion.p>
          {r.stage === "guess" && (
            <>
              <div className="w-full">
                <p.ui.Timer endsAt={r.stageEndsAt} totalMs={GUESS_MS} />
              </div>
              {canGuess && !p.priv?.myGuess && (
                <div className="grid w-full grid-cols-2 gap-3">
                  <button className="btn min-h-24 flex-col bg-good text-2xl text-[#06210f]" onClick={() => p.input({ dir: "higher" })}>
                    <ArrowUp size={34} /> Higher
                  </button>
                  <button className="btn min-h-24 flex-col bg-bad text-2xl text-white" onClick={() => p.input({ dir: "lower" })}>
                    <ArrowDown size={34} /> Lower
                  </button>
                </div>
              )}
              {p.priv?.myGuess && <p className="font-display text-2xl">You said {p.priv.myGuess}!</p>}
              {isTarget && !r.question.isData && <p className="text-muted">You know the answer. Watch them sweat.</p>}
            </>
          )}
          {r.stage === "reveal" && (
            <motion.div initial={{ rotateX: 90 }} animate={{ rotateX: 0 }} className="flex flex-col items-center gap-2">
              <p className="font-display text-xl">{r.question.isData ? "The real answer:" : `${target?.name} said:`}</p>
              <p className="font-display text-6xl">
                {r.truth}
                {unit && <span className="ml-2 text-2xl text-muted">{unit}</span>}
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {Object.entries(r.guesses ?? {}).map(([pid, dir]) => {
                  const ok = (dir === "higher") === (r.truth! > r.reference!);
                  return (
                    <span key={pid} className={`flex items-center gap-1 rounded-full px-2 py-1 ${ok ? "bg-good/30" : "bg-bad/30"}`}>
                      <p.ui.Avatar player={p.players[pid]} size={26} /> {dir === "higher" ? "↑" : "↓"} {ok ? "✓" : "✗"}
                    </span>
                  );
                })}
              </div>
            </motion.div>
          )}
        </div>
      )}

      <ul className="flex flex-wrap justify-center gap-3">
        {p.participants.map((pid) => (
          <li key={pid} className="flex items-center gap-1 font-display">
            <p.ui.Avatar player={p.players[pid]} size={28} />
            {p.pub.points[pid] ?? 0}
          </li>
        ))}
      </ul>
    </div>
  );
}
