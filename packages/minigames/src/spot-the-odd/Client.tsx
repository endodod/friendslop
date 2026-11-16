"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SoloPrivate, SoloPublic } from "@party-game/shared";
import type { MinigameClientProps } from "../kit/types";
import { SoloDone, deadlineMs } from "../kit/SoloShell";
import { levels, replay } from "./logic";

const LIMIT = 25000;

export function SpotTheOddClient(p: MinigameClientProps<SoloPublic, SoloPrivate>) {
  const ls = useMemo(() => levels(p.seed ?? 1, p.bonus), [p.seed, p.bonus]);
  const [taps, setTaps] = useState<number[]>([]);
  const [done, setDone] = useState(false);
  const [left, setLeft] = useState(LIMIT);
  const ref = useRef<number[]>([]);
  useEffect(() => {
    const end = performance.now() + deadlineMs(p, LIMIT);
    const id = setInterval(() => {
      const l = end - performance.now();
      setLeft(l);
      if (l <= 0) {
        clearInterval(id);
        setDone(true);
        p.submit({ taps: ref.current });
      }
    }, 100);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!p.isParticipant || p.priv?.submitted || done) return <SoloDone p={p} />;
  const lvl = replay(ls, taps);
  const L = ls[Math.min(lvl, ls.length - 1)];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-between font-display text-xl">
        <span>Level {lvl + 1}</span>
        <span className={left < 5000 ? "text-bad" : ""}>{Math.ceil(left / 1000)} s</span>
      </div>
      <div className="mx-auto grid w-full max-w-md gap-1" style={{ gridTemplateColumns: `repeat(${L.size}, 1fr)` }}>
        {Array.from({ length: L.size * L.size }, (_, i) => (
          <button
            key={`${lvl}-${i}`}
            aria-label={`cell ${i + 1}`}
            className="flex aspect-square items-center justify-center rounded-lg bg-panel-2 text-accent active:scale-90"
            onClick={() => {
              const next = [...ref.current, i];
              ref.current = next;
              setTaps(next);
              p.ui.play(i === L.odd ? "coin" : "miss", { volume: 0.35 });
            }}
          >
            <p.ui.Icon id={i === L.odd ? L.oddIcon : L.common} size={Math.max(18, 160 / L.size)} />
          </button>
        ))}
      </div>
    </div>
  );
}
