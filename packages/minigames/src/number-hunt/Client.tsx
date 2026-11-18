"use client";
import { motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SoloPrivate, SoloPublic } from "@party-game/shared";
import type { MinigameClientProps } from "../kit/types";
import { gameNow } from "../kit/clock";
import { SoloDone, deadlineMs } from "../kit/SoloShell";
import { Arena, Hud, Pill, PopText, SecondsPill, TimeBar } from "../kit/visual";
import { COUNT, GAME_MS, SIZE, firstNumber, grid, huntLabel, huntScore, replay } from "./logic";

export function NumberHuntClient(p: MinigameClientProps<SoloPublic, SoloPrivate>) {
  const cells = useMemo(() => grid(p.seed ?? 1), [p.seed]);
  const [taps, setTaps] = useState<number[]>([]);
  const [done, setDone] = useState(false);
  const [left, setLeft] = useState(GAME_MS);
  const [miss, setMiss] = useState<number | null>(null);
  const start = useRef(gameNow());
  const tapsRef = useRef<number[]>([]);
  const finish = (t: number[], timeMs: number) => {
    setDone(true);
    p.submit({ taps: t, timeMs: Math.round(timeMs) });
  };
  useEffect(() => {
    const end = gameNow() + deadlineMs(p, GAME_MS);
    const id = setInterval(() => {
      const l = end - gameNow();
      setLeft(l);
      if (l <= 0) {
        clearInterval(id);
        finish(tapsRef.current, gameNow() - start.current);
      }
    }, 100);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const { found, misses } = replay(cells, taps, p.bonus);
  const next = found + 1;
  if (!p.isParticipant || p.priv?.submitted || done)
    return <SoloDone p={p} label={p.isParticipant ? huntLabel(huntScore(found, misses, gameNow() - start.current)) : undefined} />;
  const tap = (i: number) => {
    if (cells[i] < next) return; // already found, ignore
    const t = [...tapsRef.current, i];
    tapsRef.current = t;
    setTaps(t);
    if (cells[i] === next) {
      p.ui.play("pop", { volume: 0.35, rate: 0.8 + next / 40 });
      if (next >= COUNT) finish(t, gameNow() - start.current);
    } else {
      setMiss(t.length);
      p.ui.play("miss", { volume: 0.4 });
      p.ui.vibrate(40);
    }
  };
  return (
    <div className="flex flex-col gap-4">
      <Hud
        left={<Pill tone="#ffc933">Find {next}</Pill>}
        right={
          <>
            {misses > 0 && <Pill tone="#ff4d5e">+{misses}s</Pill>}
            <SecondsPill ms={left} />
          </>
        }
      />
      <TimeBar left={left} total={GAME_MS} />
      <Arena tone="#ffc933" className="relative mx-auto aspect-square w-full max-w-[min(100%,52dvh)] p-3" pattern="none">
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <PopText id={miss} text="+1s" color="#ff4d5e" />
        </span>
        <div className="grid h-full w-full gap-2" style={{ gridTemplateColumns: `repeat(${SIZE}, 1fr)` }}>
          {cells.map((n, i) => {
            const got = n < next && n >= firstNumber(p.bonus);
            const pre = n < firstNumber(p.bonus);
            return (
              <motion.button
                key={i}
                type="button"
                data-testid={`hunt-${n}`}
                onPointerDown={() => tap(i)}
                animate={got ? { scale: [1, 1.15, 0.92] } : { scale: 1 }}
                className="flex touch-none select-none items-center justify-center rounded-xl font-display text-2xl tabular-nums sm:text-3xl"
                style={{
                  background: got || pre ? "#2fd27a33" : "linear-gradient(180deg, #3a3462, #2a2549)",
                  color: got || pre ? "#2fd27a" : "#f4f1ff",
                  boxShadow: got || pre ? "inset 0 0 0 1.5px #2fd27a88" : "0 3px 0 #1a1630, inset 0 1px 0 #ffffff22",
                  opacity: got || pre ? 0.55 : 1,
                }}
              >
                {n}
              </motion.button>
            );
          })}
        </div>
      </Arena>
      <p className="text-center text-sm text-muted">
        Tap 1 to {COUNT} in order. Wrong taps cost a second.
        {p.bonus && <span className="block text-accent">Bonus: 1–3 are already found</span>}
      </p>
    </div>
  );
}
