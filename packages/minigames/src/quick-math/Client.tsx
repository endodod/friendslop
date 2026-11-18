"use client";
import { gameNow } from "../kit/clock";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SoloPrivate, SoloPublic } from "@party-game/shared";
import type { MinigameClientProps } from "../kit/types";
import { motion } from "framer-motion";
import { SoloDone, deadlineMs } from "../kit/SoloShell";
import { ChunkyButton, Hud, Pill, PopText, SecondsPill, TimeBar } from "../kit/visual";
import { BASE_MS, BONUS_MS, problems } from "./logic";

export function QuickMathClient(p: MinigameClientProps<SoloPublic, SoloPrivate>) {
  const ps = useMemo(() => problems(p.seed ?? 1), [p.seed]);
  const [answers, setAnswers] = useState<number[]>([]);
  const [done, setDone] = useState(false);
  const [left, setLeft] = useState(BASE_MS + (p.bonus ? BONUS_MS : 0));
  const ans = useRef<number[]>([]);
  useEffect(() => {
    const limit = deadlineMs(p, BASE_MS + (p.bonus ? BONUS_MS : 0));
    const end = gameNow() + limit;
    const id = setInterval(() => {
      const l = end - gameNow();
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
  const lastOk = answers.length ? answers[answers.length - 1] === ps[answers.length - 1].answer : null;
  return (
    <div className="flex flex-col gap-4">
      <Hud left={<Pill tone="#2fd27a">{correct} correct</Pill>} right={<SecondsPill ms={left} />} />
      <TimeBar left={left} total={BASE_MS + (p.bonus ? BONUS_MS : 0)} />
      {/* chalkboard */}
      <div
        className="relative flex items-center justify-center overflow-hidden rounded-[22px] py-10"
        style={{
          background: "radial-gradient(90% 90% at 40% 30%, #2f5a45 0%, #1e3d2f 70%, #16302a 100%)",
          boxShadow: "0 0 0 10px #7a4e2c, 0 0 0 12px #5b3820, 0 14px 30px #000a, inset 0 0 40px #0008",
        }}
      >
        <span className="absolute left-3 top-2 font-display text-sm text-white/40">#{answers.length + 1}</span>
        <span className="absolute right-3 top-2">
          <PopText id={lastOk === null ? null : answers.length} text={lastOk ? "✓" : "✗"} color={lastOk ? "#2fd27a" : "#ff4d5e"} />
        </span>
        <motion.p
          key={answers.length}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="font-display text-6xl text-white/95"
          style={{ textShadow: "0 0 2px #fff8, 0 0 12px #ffffff33" }}
        >
          {cur.text} = ?
        </motion.p>
        <span className="absolute bottom-2 right-6 h-2 w-10 rounded-sm bg-white/80 shadow" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {cur.choices.map((c) => (
          <ChunkyButton
            key={c}
            color="#3a3462"
            textColor="#f4f1ff"
            className="min-h-20 text-4xl"
            onClick={() => {
              const next = [...answers, c];
              ans.current = next;
              setAnswers(next);
              p.ui.play(c === cur.answer ? "click" : "miss", { volume: 0.4 });
              if (c !== cur.answer) p.ui.vibrate(40);
            }}
          >
            {c}
          </ChunkyButton>
        ))}
      </div>
    </div>
  );
}
