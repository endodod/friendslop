"use client";
import { Minus, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { SoloPrivate, SoloPublic } from "@party-game/shared";
import type { MinigameClientProps } from "../kit/types";
import { SoloDone, useDeadlineSubmit } from "../kit/SoloShell";
import { BONUS_FLASH_MS, FLASH_MS, KINDS, ROUNDS, rounds } from "./logic";

export function CountItClient(p: MinigameClientProps<SoloPublic, SoloPrivate>) {
  const rs = useMemo(() => rounds(p.seed ?? 1), [p.seed]);
  const [counts, setCounts] = useState<number[]>([]);
  const [stage, setStage] = useState<"ready" | "flash" | "answer">("ready");
  const [guess, setGuess] = useState(10);
  const [done, setDone] = useState(false);
  useDeadlineSubmit(p, () => ({ counts: [...counts, ...Array(ROUNDS).fill(0)].slice(0, ROUNDS) }), done || counts.length >= ROUNDS, setDone);
  const r = rs[Math.min(counts.length, ROUNDS - 1)];
  useEffect(() => {
    if (stage !== "flash") return;
    const t = setTimeout(() => setStage("answer"), p.bonus ? BONUS_FLASH_MS : FLASH_MS);
    return () => clearTimeout(t);
  }, [stage, p.bonus]);
  if (!p.isParticipant || p.priv?.submitted || counts.length >= ROUNDS || done) return <SoloDone p={p} />;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-center font-display text-xl">
        Round {counts.length + 1}/{ROUNDS} · count the <p.ui.Icon id={KINDS[r.ask]} size={24} className="align-[-5px] text-accent" />
      </p>
      <div className="relative mx-auto aspect-square w-full max-w-[min(100%,52dvh)] overflow-hidden rounded-3xl bg-bg-2">
        {stage === "flash" &&
          r.items.map((it, i) => (
            <span key={i} className="absolute text-ink" style={{ left: `${it.x}%`, top: `${it.y}%` }}>
              <p.ui.Icon id={KINDS[it.kind]} size={26} className={it.kind === r.ask ? "text-accent" : "text-muted"} />
            </span>
          ))}
        {stage === "ready" && (
          <button className="absolute inset-0 font-display text-3xl" onClick={() => setStage("flash")}>
            Tap when ready{p.bonus ? " (bonus: longer flash)" : ""}
          </button>
        )}
        {stage === "answer" && <p className="absolute inset-0 flex items-center justify-center font-display text-3xl text-muted">How many?</p>}
      </div>
      {stage === "answer" && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-center gap-4">
            <button className="btn-secondary min-w-14" aria-label="less" onClick={() => setGuess((g) => Math.max(0, g - 1))}><Minus /></button>
            <span className="w-20 text-center font-display text-6xl tabular-nums">{guess}</span>
            <button className="btn-secondary min-w-14" aria-label="more" onClick={() => setGuess((g) => Math.min(99, g + 1))}><Plus /></button>
          </div>
          <button
            className="btn-primary min-h-14 text-2xl"
            onClick={() => {
              const next = [...counts, guess];
              setCounts(next);
              setStage("ready");
              if (next.length >= ROUNDS) p.submit({ counts: next });
            }}
          >
            Lock in
          </button>
        </div>
      )}
    </div>
  );
}
