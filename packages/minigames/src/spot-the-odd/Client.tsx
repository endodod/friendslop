"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SoloPrivate, SoloPublic } from "@party-game/shared";
import type { MinigameClientProps } from "../kit/types";
import { motion } from "framer-motion";
import { SoloDone, deadlineMs } from "../kit/SoloShell";
import { Arena, Hud, Pill, SecondsPill, TimeBar } from "../kit/visual";
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
  const misses = taps.length - lvl;
  return (
    <div className="flex flex-col gap-3">
      <Hud left={<Pill tone="#ffc933">Level {lvl + 1}</Pill>} center={misses > 0 ? <Pill tone="#ff4d5e">{misses} miss{misses > 1 ? "es" : ""}</Pill> : undefined} right={<SecondsPill ms={left} />} />
      <TimeBar left={left} total={LIMIT} />
      <Arena tone="#b26bff" className="p-3" pattern="grid">
        <motion.div
          key={lvl}
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 22 }}
          className="mx-auto grid w-full max-w-md gap-1.5"
          style={{ gridTemplateColumns: `repeat(${L.size}, 1fr)` }}
        >
          {Array.from({ length: L.size * L.size }, (_, i) => (
            <button
              key={`${lvl}-${i}`}
              aria-label={`cell ${i + 1}`}
              className="flex aspect-square items-center justify-center rounded-xl text-accent transition-transform active:scale-90"
              style={{ background: "linear-gradient(160deg, #3a3462, #241f45)", boxShadow: "inset 0 2px 0 #ffffff1a, 0 3px 0 #0d0b1a" }}
              onClick={() => {
                const next = [...ref.current, i];
                ref.current = next;
                setTaps(next);
                p.ui.play(i === L.odd ? "coin" : "miss", { volume: 0.35 });
                if (i !== L.odd) p.ui.vibrate(40);
              }}
            >
              <p.ui.Icon id={i === L.odd ? L.oddIcon : L.common} size={Math.max(18, 150 / L.size)} />
            </button>
          ))}
        </motion.div>
      </Arena>
    </div>
  );
}
