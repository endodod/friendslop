"use client";
import { motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SoloPrivate, SoloPublic } from "@party-game/shared";
import type { MinigameClientProps } from "../kit/types";
import { gameNow } from "../kit/clock";
import { useKey } from "../kit/hooks";
import { SoloDone, deadlineMs } from "../kit/SoloShell";
import { Arena, ChunkyButton, Hud, Pill, PopText, SecondsPill, TimeBar } from "../kit/visual";
import { DIRS, GAME_MS, arrows, expected, type Dir } from "./logic";

const ROT: Record<Dir, number> = { up: 0, right: 90, down: 180, left: 270 };
const KEYS: Record<string, Dir> = { ArrowUp: "up", ArrowRight: "right", ArrowDown: "down", ArrowLeft: "left", KeyW: "up", KeyD: "right", KeyS: "down", KeyA: "left" };

function ArrowGlyph({ dir, size = 64, color = "currentColor" }: { dir: Dir; size?: number; color?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ transform: `rotate(${ROT[dir]}deg)` }} aria-label={dir}>
      <path d="M12 2 L21 12 H15.5 V22 H8.5 V12 H3 Z" fill={color} />
    </svg>
  );
}

export function ArrowRushClient(p: MinigameClientProps<SoloPublic, SoloPrivate>) {
  const as = useMemo(() => arrows(p.seed ?? 1), [p.seed]);
  const [presses, setPresses] = useState<Dir[]>([]);
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [miss, setMiss] = useState<number | null>(null);
  const [done, setDone] = useState(false);
  const [left, setLeft] = useState(GAME_MS);
  const ref = useRef<Dir[]>([]);
  useEffect(() => {
    const end = gameNow() + deadlineMs(p, GAME_MS);
    const id = setInterval(() => {
      const l = end - gameNow();
      setLeft(l);
      if (l <= 0) {
        clearInterval(id);
        setDone(true);
        p.submit({ presses: ref.current });
      }
    }, 100);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const press = (d: Dir) => {
    if (done || idx >= as.length) return;
    const next = [...ref.current, d];
    ref.current = next;
    setPresses(next);
    if (d === expected(as[idx])) {
      setIdx(idx + 1);
      setScore((s) => s + 1);
      p.ui.play("click", { volume: 0.35 });
    } else {
      if (!p.bonus) setScore((s) => Math.max(0, s - 1));
      setMiss(next.length);
      p.ui.play("miss", { volume: 0.4 });
      p.ui.vibrate(40);
    }
  };
  useKey((e) => KEYS[e.code] && press(KEYS[e.code]), { keys: Object.keys(KEYS) });
  if (!p.isParticipant || p.priv?.submitted || done) return <SoloDone p={p} />;
  const cur = as[idx];
  const upcoming = as.slice(idx + 1, idx + 4);
  return (
    <div className="flex flex-col gap-4">
      <Hud left={<Pill tone="#2fd27a">{score} arrows</Pill>} right={<SecondsPill ms={left} />} />
      <TimeBar left={left} total={GAME_MS} />
      <Arena tone={cur?.flip ? "#ff4d5e" : "#2fd6d0"} className="flex flex-col items-center gap-3 py-6" pattern="grid">
        <span className="absolute right-4 top-3">
          <PopText id={miss} text="✗" color="#ff4d5e" />
        </span>
        {cur && (
          <motion.div key={idx} initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 600, damping: 22 }}>
            <ArrowGlyph dir={cur.dir} size={120} color={cur.flip ? "#ff4d5e" : "#2fd6d0"} />
          </motion.div>
        )}
        <p className="font-display text-lg text-muted">{cur?.flip ? "Red = press the OPPOSITE way!" : "Press the way it points"}</p>
        <div className="flex gap-3 opacity-60">
          {upcoming.map((a, i) => (
            <ArrowGlyph key={idx + i + 1} dir={a.dir} size={28} color={a.flip ? "#ff4d5e" : "#a29cc6"} />
          ))}
        </div>
      </Arena>
      <div className="mx-auto grid w-full max-w-xs grid-cols-3 grid-rows-2 gap-2">
        {DIRS.map((d) => (
          <ChunkyButton
            key={d}
            color="#3a3462"
            textColor="#f4f1ff"
            className={`flex min-h-20 items-center justify-center ${d === "up" ? "col-start-2 row-start-1" : d === "left" ? "col-start-1 row-start-2" : d === "down" ? "col-start-2 row-start-2" : "col-start-3 row-start-2"}`}
            onPointerDown={() => press(d)}
            ariaLabel={d}
            testId={`arrow-${d}`}
          >
            <span className="flex justify-center">
              <ArrowGlyph dir={d} size={40} />
            </span>
          </ChunkyButton>
        ))}
      </div>
      {p.bonus && <p className="text-center text-sm text-accent">Bonus: wrong presses don't cost points</p>}
      <span className="sr-only">{presses.length} presses</span>
    </div>
  );
}
