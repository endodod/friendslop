"use client";
import { motion } from "framer-motion";
import type { MinigameClientProps } from "../kit/types";
import { DECIDE_MS, POT, payoutFor } from "./logic";

interface Pub { startedAt: number; decided: string[]; choices: Record<string, "split" | "steal"> | null; revealed: boolean }

export function SplitOrStealClient(p: MinigameClientProps<Pub, { myChoice: "split" | "steal" | null; bonus: boolean; otherSlow: boolean | null }>) {
  const [a, b] = p.participants;
  const pay = p.pub.choices ? payoutFor(p.pub.choices[a], p.pub.choices[b]) : null;
  return (
    <div className="flex flex-col items-center gap-4">
      <p className="font-display text-3xl">
        Pot: <span className="text-accent">{POT} coins</span>
      </p>
      {!p.pub.revealed && <div className="w-full"><p.ui.Timer endsAt={p.pub.startedAt + DECIDE_MS} totalMs={DECIDE_MS} /></div>}
      <div className="grid w-full grid-cols-2 gap-3">
        {[a, b].map((pid, i) => (
          <div key={pid} className="flex flex-col items-center gap-2 rounded-3xl bg-bg-2 p-4">
            <p.ui.Avatar player={p.players[pid]} size={56} />
            <span className="font-display text-xl">{p.players[pid]?.name}</span>
            {p.pub.choices ? (
              <motion.span initial={{ rotateY: 90 }} animate={{ rotateY: 0 }} className={`font-display text-3xl ${p.pub.choices[pid] === "steal" ? "text-bad" : "text-good"}`}>
                {(p.pub.choices[pid] ?? "split").toUpperCase()}
              </motion.span>
            ) : (
              <span className="text-muted">{p.pub.decided.includes(pid) ? "Decided" : "Thinking…"}</span>
            )}
            {pay && <span className="font-display text-2xl text-accent">+{pay[i]}</span>}
          </div>
        ))}
      </div>
      {p.isParticipant && !p.pub.revealed && !p.priv?.myChoice && (
        <div className="grid w-full grid-cols-2 gap-3">
          <button className="btn min-h-20 bg-good text-3xl text-[#06210f]" onClick={() => p.input({ choice: "split" })}>Split</button>
          <button className="btn min-h-20 bg-bad text-3xl text-white" onClick={() => p.input({ choice: "steal" })}>Steal</button>
        </div>
      )}
      {p.priv?.myChoice && !p.pub.revealed && <p className="font-display text-xl">You chose {p.priv.myChoice}. Waiting…</p>}
      {p.priv?.otherSlow !== null && p.priv?.otherSlow !== undefined && !p.pub.revealed && (
        <p className="rounded-full bg-panel-2 px-3 py-1 text-accent">
          Bonus intel: they {p.priv.otherSlow ? "took more than 3 seconds" : "decided within 3 seconds"}.
        </p>
      )}
      <p className="text-sm text-muted">Both split: 5 each. One steals: they take all. Both steal: nobody gets anything.</p>
    </div>
  );
}
