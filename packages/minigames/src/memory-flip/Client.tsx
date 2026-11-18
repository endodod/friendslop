"use client";
import { motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SoloPrivate, SoloPublic } from "@party-game/shared";
import type { MinigameClientProps } from "../kit/types";
import { SoloStatus, SubmittedNotice } from "../kit/hooks";
import { Arena, Hud, Pill } from "../kit/visual";
import { PEEK_MS, layout } from "./logic";

export function MemoryFlipClient(p: MinigameClientProps<SoloPublic, SoloPrivate>) {
  const cards = useMemo(() => layout(p.seed ?? 1), [p.seed]);
  const [open, setOpen] = useState<number[]>([]);
  const [matched, setMatched] = useState<Set<number>>(new Set());
  const [peek, setPeek] = useState(p.bonus);
  const [done, setDone] = useState(false);
  const flips = useRef<number[]>([]);
  const start = useRef(performance.now());
  const lock = useRef(false);

  useEffect(() => {
    if (!p.bonus) return;
    const t = setTimeout(() => {
      setPeek(false);
      start.current = performance.now();
    }, PEEK_MS);
    return () => clearTimeout(t);
  }, [p.bonus]);

  // Time runs out: submit what we have.
  useEffect(() => {
    const t = setTimeout(() => {
      if (!done) {
        setDone(true);
        p.submit({ flips: flips.current.slice(0, flips.current.length - (flips.current.length % 2)), timeMs: performance.now() - start.current });
      }
    }, Math.max(0, p.endsAt - p.now() - 400));
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  const flip = (i: number) => {
    if (peek || lock.current || done || open.includes(i) || matched.has(i)) return;
    flips.current.push(i);
    const nowOpen = [...open, i];
    setOpen(nowOpen);
    p.ui.play("click", { volume: 0.3 });
    if (nowOpen.length === 2) {
      const [a, b] = nowOpen;
      if (cards[a] === cards[b]) {
        const m = new Set(matched).add(a).add(b);
        setMatched(m);
        setOpen([]);
        p.ui.play("coin", { volume: 0.3 });
        if (m.size === cards.length) {
          setDone(true);
          p.submit({ flips: flips.current, timeMs: performance.now() - start.current });
        }
      } else {
        lock.current = true;
        setTimeout(() => {
          setOpen([]);
          lock.current = false;
        }, 650);
      }
    }
  };

  if (!p.isParticipant || p.priv?.submitted || done) {
    return (
      <div className="flex flex-col gap-3">
        {p.isParticipant && <SubmittedNotice label={matched.size === cards.length ? "All pairs found!" : `${matched.size / 2} pairs`} />}
        <SoloStatus participants={p.participants} submitted={p.pub.submitted} labels={p.pub.labels} players={p.players} Avatar={p.ui.Avatar} />
      </div>
    );
  }

  const pairs = cards.length / 2;
  return (
    <div className="flex flex-col gap-3">
      <Hud
        left={<Pill tone="#2fd27a">{matched.size / 2} / {pairs} pairs</Pill>}
        right={<Pill>{Math.floor(flips.current.length / 2)} tries</Pill>}
      />
      {peek && <p className="text-center font-display text-2xl text-accent">Bonus peek! Memorize!</p>}
      <Arena tone="#b26bff" className="p-3" pattern="grid">
        <div className="mx-auto grid w-full max-w-md grid-cols-4 gap-2" data-testid="memory-grid" style={{ perspective: 800 }}>
          {cards.map((icon, i) => {
            const up = peek || open.includes(i) || matched.has(i);
            const isMatched = matched.has(i);
            return (
              <button
                key={i}
                onClick={() => flip(i)}
                aria-label={up ? icon : `card ${i + 1}`}
                className="relative aspect-square"
              >
                <motion.span
                  className="absolute inset-0"
                  initial={false}
                  animate={{ rotateY: up ? 180 : 0, scale: isMatched ? [1, 1.12, 1] : 1 }}
                  transition={{ duration: 0.3 }}
                  style={{ transformStyle: "preserve-3d" }}
                >
                  {/* back */}
                  <span
                    className="absolute inset-0 flex items-center justify-center rounded-2xl"
                    style={{
                      backfaceVisibility: "hidden",
                      background: "repeating-linear-gradient(45deg, #ffc933 0 7px, #ffb800 7px 14px)",
                      boxShadow: "inset 0 0 0 3px #fff8, 0 4px 0 #b38a12",
                    }}
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#241a00]/80 font-display text-xl text-accent">?</span>
                  </span>
                  {/* face */}
                  <span
                    className="absolute inset-0 flex items-center justify-center rounded-2xl"
                    style={{
                      backfaceVisibility: "hidden",
                      transform: "rotateY(180deg)",
                      background: isMatched ? "linear-gradient(160deg, #2fd27a55, #2fd27a22)" : "linear-gradient(160deg, #f6f3ff, #d9d3ef)",
                      boxShadow: isMatched ? "inset 0 0 0 3px #2fd27a, 0 0 18px #2fd27a66" : "0 4px 0 #8f88b5",
                      color: isMatched ? "#2fd27a" : "#2a2549",
                    }}
                  >
                    <p.ui.Icon id={icon} size={40} />
                  </span>
                </motion.span>
              </button>
            );
          })}
        </div>
      </Arena>
    </div>
  );
}
