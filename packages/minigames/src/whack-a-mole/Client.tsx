"use client";
import { gameNow } from "../kit/clock";
import { motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SoloPrivate, SoloPublic } from "@party-game/shared";
import type { MinigameClientProps } from "../kit/types";
import { SoloDone } from "../kit/SoloShell";
import { Arena, Hud, Pill, PopText, SecondsPill, TimeBar } from "../kit/visual";
import { BONUS_UP_MS, GAME_MS, HOLES, UP_MS, schedule } from "./logic";

export function WhackAMoleClient(p: MinigameClientProps<SoloPublic, SoloPrivate>) {
  const pops = useMemo(() => schedule(p.seed ?? 1), [p.seed]);
  const [hits, setHits] = useState<number[]>([]);
  const [done, setDone] = useState(false);
  const start = useRef(gameNow());
  const [t, setT] = useState(0);
  const hitsRef = useRef<number[]>([]);
  const up = p.bonus ? BONUS_UP_MS : UP_MS;
  useEffect(() => {
    const limit = Math.min(GAME_MS + up, Math.max(500, p.endsAt - p.now() - 500));
    const id = setInterval(() => {
      const now = gameNow() - start.current;
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
  const lastHit = hits.length ? hits[hits.length - 1] : null;
  return (
    <div className="flex flex-col gap-3">
      <Hud left={<Pill tone="#ffc933">{score} pts</Pill>} right={<SecondsPill ms={GAME_MS - t} />} />
      <TimeBar left={GAME_MS - t} total={GAME_MS} />
      <Arena
        tone="#2fd27a"
        className="p-4"
        pattern="stripes"
        bg="radial-gradient(90% 70% at 50% 30%, #5fd67a 0%, #2f9e4f 60%, #1c6b34 100%)"
      >
        <div className="mx-auto grid w-full max-w-sm grid-cols-3 gap-x-3 gap-y-5">
          {Array.from({ length: HOLES }, (_, h) => {
            const i = active.get(h);
            const pop = i !== undefined ? pops[i] : null;
            const hitHere = lastHit !== null && pops[lastHit].hole === h ? lastHit : null;
            return (
              <button
                key={h}
                aria-label={pop ? (pop.bomb ? "bomb" : "mole") : "empty hole"}
                className="relative flex aspect-square touch-none items-end justify-center"
                onPointerDown={() => {
                  if (i === undefined) return;
                  const next = [...hitsRef.current, i];
                  hitsRef.current = next;
                  setHits(next);
                  p.ui.play(pop!.bomb ? "bad" : "pop", { volume: 0.4 });
                  if (pop!.bomb) p.ui.vibrate(100);
                }}
              >
                {/* hole */}
                <span
                  className="absolute bottom-[6%] h-[38%] w-[92%] rounded-[50%]"
                  style={{ background: "radial-gradient(ellipse at 50% 35%, #0b0604 30%, #2a170c 75%, #6b4424 100%)", boxShadow: "0 3px 0 #1c6b34" }}
                />
                {/* creature, clipped by the hole's front lip */}
                <span className="absolute inset-x-0 bottom-[20%] top-0 flex items-end justify-center overflow-hidden">
                  {pop && (
                    <motion.span
                      initial={{ y: "100%" }}
                      animate={{ y: "8%" }}
                      transition={{ type: "spring", stiffness: 500, damping: 20 }}
                      className="flex h-[85%] w-[70%] items-start justify-center rounded-t-[45%] pt-[12%]"
                      style={{
                        background: pop.bomb
                          ? "radial-gradient(circle at 40% 30%, #6b6b80, #24232e 70%)"
                          : "radial-gradient(circle at 40% 30%, #c98a5a, #8a5530 70%)",
                        boxShadow: pop.bomb ? "0 0 18px #ff4d5e" : "inset 0 -6px 0 #0003",
                      }}
                    >
                      {pop.bomb ? <p.ui.Icon id="bomb" size={40} className="text-bad" /> : <MoleFace />}
                    </motion.span>
                  )}
                </span>
                {/* front lip */}
                <span className="absolute bottom-[6%] h-[19%] w-[92%] rounded-b-[100%] bg-[#6b4424]" style={{ clipPath: "inset(50% 0 0 0)" }} />
                <span className="absolute left-1/2 top-0 -translate-x-1/2">
                  <PopText id={hitHere} text={hitHere !== null && pops[hitHere].bomb ? "−3" : "+1"} color={hitHere !== null && pops[hitHere].bomb ? "#ff4d5e" : "#ffc933"} className="text-3xl" />
                </span>
              </button>
            );
          })}
        </div>
      </Arena>
      <p className="text-center text-sm text-muted">Moles +1 · bombs −3{p.bonus ? " · Bonus: targets stay up longer" : ""}</p>
    </div>
  );
}

/** Simple drawn mole face: eyes, nose, teeth. */
function MoleFace() {
  return (
    <span className="relative flex w-full flex-col items-center" aria-hidden>
      <span className="flex gap-[22%]">
        <span className="h-2.5 w-2.5 rounded-full bg-[#14112a] shadow-[inset_1px_1px_0_#fff8]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#14112a] shadow-[inset_1px_1px_0_#fff8]" />
      </span>
      <span className="mt-1 h-3 w-5 rounded-[50%] bg-[#ff8fa3] shadow-[inset_0_-2px_0_#0003]" />
      <span className="mt-0.5 flex gap-px">
        <span className="h-2 w-1.5 rounded-b-sm bg-white" />
        <span className="h-2 w-1.5 rounded-b-sm bg-white" />
      </span>
    </span>
  );
}
