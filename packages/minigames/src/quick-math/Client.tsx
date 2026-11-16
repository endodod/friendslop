"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SoloPrivate, SoloPublic } from "@party-game/shared";
import type { MinigameClientProps } from "../kit/types";
import { SoloDone, deadlineMs } from "../kit/SoloShell";
import { BASE_MS, BONUS_MS, problems } from "./logic";

export function QuickMathClient(p: MinigameClientProps<SoloPublic, SoloPrivate>) {
  const ps = useMemo(() => problems(p.seed ?? 1), [p.seed]);
  const [answers, setAnswers] = useState<number[]>([]);
  const [done, setDone] = useState(false);
  const [left, setLeft] = useState(BASE_MS + (p.bonus ? BONUS_MS : 0));
  const ans = useRef<number[]>([]);
  useEffect(() => {
    const limit = deadlineMs(p, BASE_MS + (p.bonus ? BONUS_MS : 0));
    const end = performance.now() + limit;
    const id = setInterval(() => {
      const l = end - performance.now();
      setLeft(l);
      if (l <= 0) {
        clearInterval(id);
        setDone(true);
        p.submit({ answers: ans.current });
      }
    }, 100);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!p.isParticipant || p.priv?.submitted || done) return <SoloDone p={p} />;
  const cur = ps[answers.length];
  const correct = answers.filter((a, i) => a === ps[i].answer).length;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between font-display text-xl">
        <span>{correct} correct</span>
        <span className={left < 5000 ? "text-bad" : ""}>{Math.ceil(left / 1000)} s</span>
      </div>
      <p className="text-center font-display text-6xl">{cur.text}</p>
      <div className="grid grid-cols-2 gap-3">
        {cur.choices.map((c) => (
          <button
            key={c}
            className="btn-secondary min-h-20 text-4xl"
            onClick={() => {
              const next = [...answers, c];
              ans.current = next;
              setAnswers(next);
              p.ui.play(c === cur.answer ? "click" : "miss", { volume: 0.4 });
            }}
          >
            {c}
          </button>
        ))}
      </div>
    </div>
  );
}
