"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SoloPrivate, SoloPublic } from "@party-game/shared";
import type { MinigameClientProps } from "../kit/types";
import { SoloDone, deadlineMs } from "../kit/SoloShell";
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
  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between font-display text-xl">
        <span>{Math.max(0, score)} pts</span>
        <span className={left < 5000 ? "text-bad" : ""}>{Math.ceil(left / 1000)} s</span>
      </div>
      <p className="text-center text-muted">Tap the INK color, not the word!</p>
      <p className="py-6 text-center font-display text-7xl" style={{ color: COLORS[card.ink].hex }}>
        {COLORS[card.word].word}
      </p>
      <div className="grid grid-cols-2 gap-3">
        {COLORS.map((c, i) => (
          <button
            key={c.id}
            aria-label={c.id}
            className="min-h-20 rounded-2xl font-display text-xl text-[#14112a]"
            style={{ background: c.hex }}
            onClick={() => {
              const next = [...picks, i];
              ref.current = next;
              setPicks(next);
              p.ui.play(i === card.ink ? "click" : "miss", { volume: 0.4 });
            }}
          >
            {c.word}
          </button>
        ))}
      </div>
    </div>
  );
}
