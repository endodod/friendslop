"use client";
import { motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SoloPrivate, SoloPublic } from "@party-game/shared";
import type { MinigameClientProps } from "../kit/types";
import { SoloStatus, SubmittedNotice } from "../kit/hooks";
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

  return (
    <div className="flex flex-col gap-3">
      <p className="text-center font-display text-xl">
        {peek ? "Bonus peek! Memorize!" : `${matched.size / 2} / ${cards.length / 2} pairs`}
      </p>
      <div className="mx-auto grid w-full max-w-md grid-cols-4 gap-2" data-testid="memory-grid">
        {cards.map((icon, i) => {
          const up = peek || open.includes(i) || matched.has(i);
          return (
            <motion.button
              key={`${i}-${up}`}
              onClick={() => flip(i)}
              initial={{ scaleX: 0.1 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.18 }}
              aria-label={up ? icon : `card ${i + 1}`}
              className={`flex aspect-square items-center justify-center rounded-2xl ${matched.has(i) ? "bg-good/40" : up ? "bg-panel-2" : "bg-accent"}`}
            >
              {up ? <p.ui.Icon id={icon} size={40} /> : <span className="font-display text-2xl text-[#241a00]">?</span>}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
