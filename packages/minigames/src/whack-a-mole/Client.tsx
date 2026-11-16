"use client";
import { motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SoloPrivate, SoloPublic } from "@party-game/shared";
import type { MinigameClientProps } from "../kit/types";
import { SoloDone } from "../kit/SoloShell";
import { BONUS_UP_MS, GAME_MS, HOLES, UP_MS, schedule } from "./logic";

export function WhackAMoleClient(p: MinigameClientProps<SoloPublic, SoloPrivate>) {
  const pops = useMemo(() => schedule(p.seed ?? 1), [p.seed]);
  const [hits, setHits] = useState<number[]>([]);
  const [done, setDone] = useState(false);
  const start = useRef(performance.now());
  const [t, setT] = useState(0);
  const hitsRef = useRef<number[]>([]);
  const up = p.bonus ? BONUS_UP_MS : UP_MS;
  useEffect(() => {
    const limit = Math.min(GAME_MS + up, Math.max(500, p.endsAt - p.now() - 500));
    const id = setInterval(() => {
      const now = performance.now() - start.current;
      setT(now);
      if (now >= limit) {
        clearInterval(id);
        setDone(true);
        p.submit({ hits: hitsRef.current });
      }
    }, 50);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!p.isParticipant || p.priv?.submitted || done) return <SoloDone p={p} />;
  const active = new Map<number, number>();
  pops.forEach((pop, i) => {
    if (t >= pop.at && t < pop.at + up && !hits.includes(i)) active.set(pop.hole, i);
  });
  const score = hits.reduce((s, i) => s + (pops[i].bomb ? -3 : 1), 0);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-between font-display text-xl">
        <span>{score} pts</span>
        <span>{Math.max(0, Math.ceil((GAME_MS - t) / 1000))} s</span>
      </div>
      <div className="mx-auto grid w-full max-w-sm grid-cols-3 gap-3">
        {Array.from({ length: HOLES }, (_, h) => {
          const i = active.get(h);
          const pop = i !== undefined ? pops[i] : null;
          return (
            <button
              key={h}
              aria-label={pop ? (pop.bomb ? "bomb" : "mole") : "empty hole"}
              className="flex aspect-square touch-none items-center justify-center rounded-full bg-[#15122b] shadow-[inset_0_8px_0_#000a]"
              onPointerDown={() => {
                if (i === undefined) return;
                const next = [...hitsRef.current, i];
                hitsRef.current = next;
                setHits(next);
                p.ui.play(pop!.bomb ? "bad" : "pop", { volume: 0.4 });
                if (pop!.bomb) p.ui.vibrate(100);
              }}
            >
              {pop && (
                <motion.span initial={{ y: 30, scale: 0.4 }} animate={{ y: 0, scale: 1 }}>
                  <p.ui.Icon id={pop.bomb ? "bomb" : "mole"} size={52} className={pop.bomb ? "text-bad" : "text-accent"} />
                </motion.span>
              )}
            </button>
          );
        })}
      </div>
      <p className="text-center text-sm text-muted">Hammers +1 · bombs −3{p.bonus ? " · Bonus: targets stay up longer" : ""}</p>
    </div>
  );
}
