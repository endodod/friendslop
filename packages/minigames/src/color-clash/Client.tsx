"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SoloPrivate, SoloPublic } from "@party-game/shared";
import type { MinigameClientProps } from "../kit/types";
import { motion } from "framer-motion";
import { SoloDone, deadlineMs } from "../kit/SoloShell";
import { Arena, ChunkyButton, Hud, Pill, SecondsPill, TimeBar } from "../kit/visual";
import { BASE_MS, BONUS_MS, COLORS, cards } from "./logic";

export function ColorClashClient(p: MinigameClientProps<SoloPublic, SoloPrivate>) {
  const cs = useMemo(() => cards(p.seed ?? 1), [p.seed]);
  const [picks, setPicks] = useState<number[]>([]);
  const [done, setDone] = useState(false);
  const [left, setLeft] = useState(BASE_MS);
  const ref = useRef<number[]>([]);
  useEffect(() => {
    const end = performance.now() + deadlineMs(p, BASE_MS + (p.bonus ? BONUS_MS : 0));
    const id = setInterval(() => {
      const l = end - performance.now();
      setLeft(l);
      if (l <= 0) {
        clearInterval(id);
        setDone(true);
        p.submit({ picks: ref.current });
      }
    }, 100);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!p.isParticipant || p.priv?.submitted || done) return <SoloDone p={p} />;
  const card = cs[picks.length];
  const score = picks.reduce((s, x, i) => s + (x === cs[i].ink ? 1 : -1), 0);
  let combo = 0;
  for (let i = picks.length - 1; i >= 0 && picks[i] === cs[i].ink; i--) combo++;
  const lastWrong = picks.length > 0 && picks[picks.length - 1] !== cs[picks.length - 1].ink;
  return (
    <div className="flex flex-col gap-4">
      <Hud
        left={<Pill tone="#ffc933">{Math.max(0, score)} pts</Pill>}
        center={combo >= 3 ? <Pill tone="#ff8a3d">🔥 ×{combo}</Pill> : undefined}
        right={<SecondsPill ms={left} />}
      />
      <TimeBar left={left} total={BASE_MS + (p.bonus ? BONUS_MS : 0)} />
      <p className="text-center text-muted">
        Tap the <span className="font-display text-ink">INK</span> color, not the word!
      </p>
      <Arena tone="#ffffff" className="flex items-center justify-center py-10" pattern="dots">
        <motion.p
          key={picks.length}
          initial={{ scale: 0.4, rotate: -8, opacity: 0 }}
          animate={lastWrong ? { scale: 1, rotate: 0, opacity: 1, x: [0, -8, 8, 0] } : { scale: 1, rotate: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 500, damping: 22 }}
          className="font-display text-7xl drop-shadow-[0_4px_0_#000a]"
          style={{ color: COLORS[card.ink].hex }}
        >
          {COLORS[card.word].word}
        </motion.p>
      </Arena>
      <div className="grid grid-cols-2 gap-3">
        {COLORS.map((c, i) => (
          <ChunkyButton
            key={c.id}
            ariaLabel={c.id}
            color={c.hex}
            className="min-h-20 text-xl"
            onClick={() => {
              const next = [...picks, i];
              ref.current = next;
              setPicks(next);
              p.ui.play(i === card.ink ? "click" : "miss", { volume: 0.4 });
              if (i !== card.ink) p.ui.vibrate(40);
            }}
          >
            {c.word}
          </ChunkyButton>
        ))}
      </div>
    </div>
  );
}
