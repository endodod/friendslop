"use client";
import { Minus, Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SoloPrivate, SoloPublic } from "@party-game/shared";
import type { MinigameClientProps } from "../kit/types";
import { KeyHint, useKey } from "../kit/hooks";
import { motion } from "framer-motion";
import { SoloDone, useDeadlineSubmit } from "../kit/SoloShell";
import { ChunkyButton, Hud, Pill, RoundDots } from "../kit/visual";
import { BONUS_FLASH_MS, FLASH_MS, KINDS, ROUNDS, rounds } from "./logic";

export function CountItClient(p: MinigameClientProps<SoloPublic, SoloPrivate>) {
  const keyAction = useRef<(() => void) | null>(null);
  keyAction.current = null;
  useKey(() => keyAction.current?.());
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
  if (stage === "ready") keyAction.current = () => setStage("flash");
  return (
    <div className="flex flex-col gap-4">
      <Hud
        left={<RoundDots total={ROUNDS} done={counts.length} />}
        right={
          <Pill tone="#ffc933">
            Count the <p.ui.Icon id={KINDS[r.ask]} size={20} className="align-[-4px]" />
          </Pill>
        }
      />
      <div
        className="relative mx-auto aspect-square w-full max-w-[min(100%,52dvh)] overflow-hidden rounded-[28px]"
        style={{
          background: "radial-gradient(1px 1px at 15% 20%, #fff6, transparent), radial-gradient(1px 1px at 75% 70%, #fff5, transparent), radial-gradient(90% 90% at 50% 40%, #241f55 0%, #0d0b1a 100%)",
          boxShadow: "inset 0 0 0 2px #ffc93355, inset 0 0 50px #000a, 0 10px 30px #0008",
        }}
      >
        {stage === "flash" &&
          r.items.map((it, i) => (
            <motion.span
              key={i}
              initial={{ scale: 0, rotate: -40 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: (i % 12) * 0.012, type: "spring", stiffness: 500, damping: 20 }}
              className="absolute"
              style={{ left: `${it.x}%`, top: `${it.y}%` }}
            >
              <p.ui.Icon id={KINDS[it.kind]} size={26} className={it.kind === r.ask ? "text-accent drop-shadow-[0_0_6px_#ffc933]" : "text-muted"} />
            </motion.span>
          ))}
        {stage === "flash" && (
          <motion.span
            className="absolute inset-x-0 bottom-0 h-1.5 bg-accent"
            initial={{ width: "100%" }}
            animate={{ width: "0%" }}
            transition={{ duration: (p.bonus ? BONUS_FLASH_MS : FLASH_MS) / 1000, ease: "linear" }}
          />
        )}
        {stage === "ready" && (
          <button className="absolute inset-0 flex flex-col items-center justify-center gap-3 font-display text-3xl" onClick={() => setStage("flash")}>
            <motion.span animate={{ scale: [1, 1.08, 1] }} transition={{ repeat: Infinity, duration: 1.2 }}>
              <p.ui.Icon id={KINDS[r.ask]} size={72} className="text-accent drop-shadow-[0_0_14px_#ffc933]" />
            </motion.span>
            Tap when ready
            {p.bonus && <span className="text-base text-accent">Bonus: longer flash</span>}
            <KeyHint />
          </button>
        )}
        {stage === "answer" && (
          <p className="absolute inset-0 flex flex-col items-center justify-center gap-2 font-display text-3xl text-muted">
            <span className="text-7xl">?</span>
            How many <p.ui.Icon id={KINDS[r.ask]} size={30} className="text-accent" />?
          </p>
        )}
      </div>
      {stage === "answer" && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-center gap-4">
            <button className="btn-secondary min-h-16 min-w-16" aria-label="less" onClick={() => setGuess((g) => Math.max(0, g - 1))}><Minus /></button>
            <motion.span key={guess} initial={{ scale: 1.3 }} animate={{ scale: 1 }} className="w-24 text-center font-display text-7xl tabular-nums text-accent">
              {guess}
            </motion.span>
            <button className="btn-secondary min-h-16 min-w-16" aria-label="more" onClick={() => setGuess((g) => Math.min(99, g + 1))}><Plus /></button>
          </div>
          <ChunkyButton
            color="#ffc933"
            className="min-h-14 text-2xl"
            onClick={() => {
              const next = [...counts, guess];
              setCounts(next);
              setStage("ready");
              if (next.length >= ROUNDS) p.submit({ counts: next });
            }}
          >
            Lock in
          </ChunkyButton>
        </div>
      )}
    </div>
  );
}
