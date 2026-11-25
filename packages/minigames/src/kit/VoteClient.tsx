"use client";
import { motion } from "framer-motion";
import { Lock } from "lucide-react";
import { useEffect, useState } from "react";
import type { Answer } from "@party-game/shared";
import type { ReactNode } from "react";
import type { MinigameClientProps } from "./types";
import { Arena, ChunkyButton, RoundDots, ScoreStrip } from "./visual";
import { VOTE_MS, type VotePublic } from "./voteGame";

export interface VoteClientOptions {
  tone: string;
  /** Shown under the prompt while voting (what counts this round). */
  hint?: (p: MinigameClientProps<VotePublic>) => ReactNode;
  /** Shown in the reveal when nobody scored. */
  noWinner: string;
}

/** Shared screen for the voting mini-games (Most Likely To, Judge's Call, Hall of Fame). */
export function VoteClient({ opts, ...p }: MinigameClientProps<VotePublic, { myVote: string | null }> & { opts: VoteClientOptions }) {
  const r = p.pub.round;
  const [draft, setDraft] = useState<Answer | null>(null);
  useEffect(() => setDraft(null), [p.pub.index]);
  // Time's almost up and you picked someone but didn't vote: that pick counts.
  useEffect(() => {
    const r = p.pub.round;
    // No clock (stageEndsAt 0): nothing to beat.
    if (!r || r.stage !== "vote" || !r.stageEndsAt || !p.isParticipant || p.priv?.myVote || !draft) return;
    const t = setTimeout(() => p.input({ answer: draft }), Math.max(0, r.stageEndsAt - p.now() - 700));
    return () => clearTimeout(t);
  }, [p, draft]);
  if (!r) return <p className="text-center text-muted">Counting votes…</p>;
  const counts: Record<string, string[]> = {};
  for (const [voter, choice] of Object.entries(r.votes ?? {})) counts[choice] = [...(counts[choice] ?? []), voter];

  const maxVotes = Math.max(1, ...Object.values(counts).map((v) => v.length));
  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-center">
        <RoundDots total={p.pub.total} done={p.pub.index} />
      </div>
      <Arena tone={opts.tone} className="px-4 py-6" pattern="dots">
        <motion.h2
          key={p.pub.index}
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="text-center font-display text-3xl leading-tight"
        >
          {r.question.prompt}
        </motion.h2>
        {r.judge && (
          <p className="mt-3 flex items-center justify-center gap-2 font-display text-lg">
            <p.ui.Avatar player={p.players[r.judge]} size={28} />
            {r.judge === p.me ? "You're the judge: just vote honestly." : `${p.players[r.judge]?.name} is the judge. Match their pick!`}
          </p>
        )}
        {!r.judge && opts.hint && r.stage === "vote" && <p className="mt-3 text-center text-muted">{opts.hint(p)}</p>}
      </Arena>
      {r.stage === "vote" && (
        <>
          <p.ui.Timer endsAt={r.stageEndsAt} totalMs={VOTE_MS} />
          {p.isParticipant && !p.priv?.myVote ? (
            <>
              <p.ui.AnswerInput
                question={p.pub.noSelfVote ? { ...r.question, playerChoices: r.question.playerChoices?.filter((x) => x !== p.me) } : r.question}
                value={draft}
                onChange={setDraft}
              />
              <ChunkyButton color="#ffc933" className="flex min-h-14 items-center justify-center gap-2 text-2xl" disabled={!draft} onClick={() => draft && p.input({ answer: draft })}>
                <Lock size={20} /> Vote
              </ChunkyButton>
            </>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <div className="flex flex-wrap justify-center gap-2">
                {p.participants.map((pid) => (
                  <p.ui.Avatar key={pid} player={p.players[pid]} size={34} dim={!r.voted.includes(pid)} ring={r.voted.includes(pid)} />
                ))}
              </div>
              <p className="font-display text-xl text-muted">
                {r.voted.length}/{p.participants.length} voted
              </p>
            </div>
          )}
        </>
      )}
      {r.stage === "reveal" && (
        <ul className="flex flex-col gap-2">
          {p.participants
            .slice()
            .sort((a, b) => (counts[b]?.length ?? 0) - (counts[a]?.length ?? 0))
            .map((pid, i) => {
              const n = counts[pid]?.length ?? 0;
              const win = r.winners.includes(pid);
              const plus = r.gained?.[pid] ?? 0;
              return (
                <motion.li
                  key={pid}
                  initial={{ x: -30, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: i * 0.2 }}
                  className="relative flex items-center gap-3 overflow-hidden rounded-2xl p-3"
                  style={{
                    background: "#ffffff0d",
                    boxShadow: win ? "inset 0 0 0 2px #ffc933, 0 0 24px #ffc93344" : "inset 0 0 0 1px #ffffff14",
                  }}
                >
                  {/* vote bar */}
                  <motion.span
                    aria-hidden
                    className="absolute inset-y-0 left-0"
                    style={{ background: win ? "linear-gradient(90deg, #ffc93355, #ffc93322)" : "linear-gradient(90deg, #ff6bc633, #ff6bc611)" }}
                    initial={{ width: 0 }}
                    animate={{ width: `${(n / maxVotes) * 100}%` }}
                    transition={{ delay: 0.3 + i * 0.2, duration: 0.6 }}
                  />
                  <span className="relative">
                    <p.ui.Avatar player={p.players[pid]} size={40} />
                  </span>
                  <span className="relative flex-1 font-display text-xl">
                    {win && "👑 "}
                    {p.players[pid]?.name}
                  </span>
                  <span className="relative flex -space-x-2">
                    {(counts[pid] ?? []).map((v) => (
                      <p.ui.Avatar key={v} player={p.players[v]} size={28} />
                    ))}
                  </span>
                  <span className="relative w-8 text-right font-display text-2xl">{n}</span>
                  {plus > 0 && <span className="relative font-display text-lg text-good">+{plus}</span>}
                </motion.li>
              );
            })}
          {r.winners.length === 0 && <p className="text-center text-muted">{opts.noWinner}</p>}
        </ul>
      )}
      <ScoreStrip participants={p.participants} points={p.pub.points} renderAvatar={(pid) => <p.ui.Avatar player={p.players[pid]} size={28} />} />
    </div>
  );
}
