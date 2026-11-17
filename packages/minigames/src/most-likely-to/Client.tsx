"use client";
import { motion } from "framer-motion";
import { Lock } from "lucide-react";
import { useEffect, useState } from "react";
import type { Answer } from "@party-game/shared";
import type { MinigameClientProps } from "../kit/types";
import { VOTE_MS, type MltPublic } from "./logic";

export function MostLikelyToClient(p: MinigameClientProps<MltPublic, { myVote: string | null }>) {
  const r = p.pub.round;
  const [draft, setDraft] = useState<Answer | null>(null);
  useEffect(() => setDraft(null), [p.pub.index]);
  // Time's almost up and you picked someone but didn't vote: that pick counts.
  useEffect(() => {
    const r = p.pub.round;
    if (!r || r.stage !== "vote" || !p.isParticipant || p.priv?.myVote || !draft) return;
    const t = setTimeout(() => p.input({ answer: draft }), Math.max(0, r.stageEndsAt - p.now() - 700));
    return () => clearTimeout(t);
  }, [p, draft]);
  if (!r) return <p className="text-center text-muted">Counting votes…</p>;
  const counts: Record<string, string[]> = {};
  for (const [voter, choice] of Object.entries(r.votes ?? {})) counts[choice] = [...(counts[choice] ?? []), voter];

  return (
    <div className="flex flex-col gap-4">
      <p className="text-center text-muted">
        Prompt {p.pub.index + 1}/{p.pub.total}
      </p>
      <h2 className="text-center font-display text-3xl leading-tight">{r.question.prompt}</h2>
      {r.stage === "vote" && (
        <>
          <p.ui.Timer endsAt={r.stageEndsAt} totalMs={VOTE_MS} />
          {p.isParticipant && !p.priv?.myVote ? (
            <>
              <p.ui.AnswerInput question={r.question} value={draft} onChange={setDraft} />
              <button className="btn-primary min-h-14 text-2xl" disabled={!draft} onClick={() => draft && p.input({ answer: draft })}>
                <Lock size={20} /> Vote
              </button>
            </>
          ) : (
            <p className="text-center font-display text-xl text-muted">
              {r.voted.length}/{p.participants.length} voted
            </p>
          )}
        </>
      )}
      {r.stage === "reveal" && (
        <ul className="flex flex-col gap-2">
          {p.participants
            .slice()
            .sort((a, b) => (counts[b]?.length ?? 0) - (counts[a]?.length ?? 0))
            .map((pid, i) => (
              <motion.li
                key={pid}
                initial={{ x: -30, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: i * 0.2 }}
                className={`flex items-center gap-3 rounded-2xl p-3 ${r.majority.includes(pid) ? "bg-accent/25 ring-2 ring-accent" : "bg-bg-2"}`}
              >
                <p.ui.Avatar player={p.players[pid]} size={40} />
                <span className="flex-1 font-display text-xl">{p.players[pid]?.name}</span>
                <span className="flex -space-x-2">
                  {(counts[pid] ?? []).map((v) => (
                    <p.ui.Avatar key={v} player={p.players[v]} size={28} />
                  ))}
                </span>
                <span className="w-8 text-right font-display text-2xl">{counts[pid]?.length ?? 0}</span>
              </motion.li>
            ))}
          {r.majority.length === 0 && <p className="text-center text-muted">No majority. Nobody scores!</p>}
        </ul>
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
