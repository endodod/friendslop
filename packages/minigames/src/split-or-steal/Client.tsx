"use client";
import { motion } from "framer-motion";
import type { MinigameClientProps } from "../kit/types";
import { Arena, ChunkyButton, Pill } from "../kit/visual";
import { DECIDE_MS, POT, payoutFor } from "./logic";

interface Pub { startedAt: number; decided: string[]; choices: Record<string, "split" | "steal"> | null; revealed: boolean }

export function SplitOrStealClient(p: MinigameClientProps<Pub, { myChoice: "split" | "steal" | null; bonus: boolean; otherSlow: boolean | null }>) {
  const [a, b] = p.participants;
  const pay = p.pub.choices ? payoutFor(p.pub.choices[a], p.pub.choices[b]) : null;
  return (
    <div className="flex flex-col items-center gap-4">
      {/* pot */}
      <div className="flex flex-col items-center">
        <div className="relative h-20 w-40">
          {Array.from({ length: 9 }, (_, i) => (
            <motion.span
              key={i}
              className="absolute h-8 w-8 rounded-full"
              style={{
                left: `${10 + (i % 5) * 18 + (i >= 5 ? 9 : 0)}%`,
                bottom: i >= 5 ? 26 : 4,
                background: "radial-gradient(circle at 35% 30%, #fff3c4, #ffc933 50%, #c9940f)",
                boxShadow: "0 3px 0 #8a6508, inset 0 0 0 2px #ffffff44",
              }}
              animate={{ y: [0, -3, 0] }}
              transition={{ repeat: Infinity, duration: 1.4, delay: i * 0.1 }}
            />
          ))}
        </div>
        <p className="font-display text-3xl">
          Pot: <span className="text-accent drop-shadow-[0_0_10px_#ffc93388]">{POT} coins</span>
        </p>
      </div>
      {!p.pub.revealed && <div className="w-full"><p.ui.Timer endsAt={p.pub.startedAt + DECIDE_MS} totalMs={DECIDE_MS} /></div>}
      <div className="grid w-full grid-cols-2 gap-3">
        {[a, b].map((pid, i) => {
          const choice = p.pub.choices?.[pid] ?? "split";
          const steal = choice === "steal";
          const tone = p.pub.choices ? (steal ? "#ff4d5e" : "#2fd27a") : p.pub.decided.includes(pid) ? "#ffc933" : "#7b5cff";
          return (
            <Arena key={pid} tone={tone} className="flex flex-col items-center gap-2 p-4">
              <p.ui.Avatar player={p.players[pid]} size={56} />
              <span className="max-w-full truncate font-display text-xl">{p.players[pid]?.name}</span>
              <div className="h-24 w-20" style={{ perspective: 600 }}>
                <motion.div
                  className="relative h-full w-full"
                  initial={false}
                  animate={{ rotateY: p.pub.choices ? 180 : 0 }}
                  transition={{ duration: 0.6, delay: i * 0.4 }}
                  style={{ transformStyle: "preserve-3d" }}
                >
                  <span
                    className="absolute inset-0 flex items-center justify-center rounded-xl font-display text-4xl"
                    style={{
                      backfaceVisibility: "hidden",
                      background: "repeating-linear-gradient(45deg, #3a3462 0 6px, #2a2549 6px 12px)",
                      boxShadow: `inset 0 0 0 2px ${p.pub.decided.includes(pid) ? "#ffc933" : "#ffffff22"}`,
                      color: p.pub.decided.includes(pid) ? "#ffc933" : "#a29cc6",
                    }}
                  >
                    {p.pub.decided.includes(pid) ? "✓" : "?"}
                  </span>
                  <span
                    className="absolute inset-0 flex items-center justify-center rounded-xl font-display text-xl"
                    style={{
                      backfaceVisibility: "hidden",
                      transform: "rotateY(180deg)",
                      background: steal ? "linear-gradient(160deg, #ff7b88, #ff4d5e 60%, #b3263a)" : "linear-gradient(160deg, #7dffb3, #2fd27a 60%, #1a8c4f)",
                      color: steal ? "#fff" : "#06210f",
                      boxShadow: `0 0 24px ${steal ? "#ff4d5e" : "#2fd27a"}88`,
                    }}
                  >
                    {choice.toUpperCase()}
                  </span>
                </motion.div>
              </div>
              {!p.pub.choices && <span className="text-sm text-muted">{p.pub.decided.includes(pid) ? "Decided" : "Thinking…"}</span>}
              {pay && (
                <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 1.1 }} className={`font-display text-2xl ${pay[i] > 0 ? "text-accent" : "text-muted"}`}>
                  +{pay[i]}
                </motion.span>
              )}
            </Arena>
          );
        })}
      </div>
      {p.isParticipant && !p.pub.revealed && !p.priv?.myChoice && (
        <div className="grid w-full grid-cols-2 gap-3">
          <ChunkyButton color="#2fd27a" textColor="#06210f" className="min-h-20 text-3xl" onClick={() => p.input({ choice: "split" })}>Split</ChunkyButton>
          <ChunkyButton color="#ff4d5e" textColor="#fff" className="min-h-20 text-3xl" onClick={() => p.input({ choice: "steal" })}>Steal</ChunkyButton>
        </div>
      )}
      {p.priv?.myChoice && !p.pub.revealed && (
        <p className="font-display text-xl">
          You chose <span className={p.priv.myChoice === "steal" ? "text-bad" : "text-good"}>{p.priv.myChoice}</span>. Waiting…
        </p>
      )}
      {p.priv?.otherSlow !== null && p.priv?.otherSlow !== undefined && !p.pub.revealed && (
        <Pill tone="#ffc933">Bonus intel: they {p.priv.otherSlow ? "took more than 3 seconds" : "decided within 3 seconds"}.</Pill>
      )}
      <p className="text-center text-sm text-muted">Both split: 5 each. One steals: they take all. Both steal: nobody gets anything.</p>
    </div>
  );
}
