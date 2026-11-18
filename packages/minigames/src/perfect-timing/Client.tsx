"use client";
import { gameNow } from "../kit/clock";
import { useEffect, useRef, useState } from "react";
import type { SoloPrivate, SoloPublic } from "@party-game/shared";
import type { MinigameClientProps } from "../kit/types";
import { motion } from "framer-motion";
import { KeyHint, SoloStatus, SubmittedNotice, useKey } from "../kit/hooks";
import { Arena, ChunkyButton, Pill } from "../kit/visual";
import { GOAL_MS, VISIBLE_MS } from "./logic";

export function PerfectTimingClient(p: MinigameClientProps<SoloPublic, SoloPrivate>) {
  const keyAction = useRef<(() => void) | null>(null);
  keyAction.current = null;
  useKey(() => keyAction.current?.());
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [result, setResult] = useState<number | null>(null);
  const [, force] = useState(0);
  const raf = useRef(0);
  useEffect(() => {
    if (startedAt === null || result !== null) return;
    const loop = () => (force((n) => n + 1), (raf.current = requestAnimationFrame(loop)));
    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
  }, [startedAt, result]);

  if (!p.isParticipant || p.priv?.submitted || result !== null) {
    return (
      <div className="flex flex-col gap-3">
        {p.isParticipant && result !== null && <SubmittedNotice label={`${(result / 1000).toFixed(2)} s (±${(Math.abs(result - GOAL_MS) / 1000).toFixed(2)})`} />}
        <SoloStatus participants={p.participants} submitted={p.pub.submitted} labels={p.pub.labels} players={p.players} Avatar={p.ui.Avatar} />
      </div>
    );
  }
  keyAction.current = () => {
    if (startedAt === null) return setStartedAt(gameNow());
    const e = gameNow() - startedAt;
    setResult(e);
    p.submit({ elapsedMs: e });
  };
  const el = startedAt === null ? 0 : gameNow() - startedAt;
  const visible = el < (p.bonus ? VISIBLE_MS : 1000);
  const angle = (el / GOAL_MS) * 360;
  return (
    <div className="flex flex-col items-center gap-5 py-2">
      <Pill tone="#ffc933">Stop at exactly {GOAL_MS / 1000}.00 s</Pill>
      <Arena tone="#3d8bff" className="flex w-full flex-col items-center gap-4 py-6">
        <div className="relative aspect-square w-60">
          {/* crown */}
          <span className="absolute -top-3 left-1/2 h-5 w-8 -translate-x-1/2 rounded-t-lg bg-[#c9c3e6] shadow-[0_2px_0_#0006]" />
          <div
            className="absolute inset-0 rounded-full"
            style={{ background: "radial-gradient(circle at 40% 30%, #ffffff, #e6e1f7 55%, #b9b2d8)", boxShadow: "0 0 0 8px #3a3462, 0 0 0 11px #c9c3e6, 0 16px 30px #000a" }}
          >
            {Array.from({ length: 60 }, (_, i) => (
              <span
                key={i}
                className="absolute left-1/2 top-0 h-1/2 origin-bottom"
                style={{ transform: `translateX(-50%) rotate(${i * 6}deg)` }}
              >
                <span className={`block rounded-full ${i % 6 === 0 ? "h-3.5 w-1 bg-[#14112a]" : "mt-1 h-2 w-0.5 bg-[#14112a88]"}`} style={{ marginTop: 8 }} />
              </span>
            ))}
            {/* goal marker */}
            <span className="absolute left-1/2 top-6 -translate-x-1/2 rounded-full bg-good px-1.5 font-display text-xs text-[#06210f]">10</span>
            {/* hand */}
            <span
              className="absolute left-1/2 top-1/2 h-[42%] w-1.5 origin-bottom rounded-full bg-bad"
              style={{ transform: `translate(-50%, -100%) rotate(${angle}deg)`, boxShadow: "0 0 6px #ff4d5e", opacity: visible || startedAt === null ? 1 : 0 }}
            />
            <span className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#14112a]" />
            {/* digital readout */}
            <span className="absolute bottom-[22%] left-1/2 -translate-x-1/2 rounded-lg bg-[#14112a] px-2 py-0.5 font-display text-2xl tabular-nums text-accent">
              {startedAt === null ? "0.00" : visible ? (el / 1000).toFixed(2) : "?.??"}
            </span>
          </div>
          {/* fog once the timer hides */}
          <motion.div
            className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-full backdrop-blur-md"
            style={{ background: "radial-gradient(circle, #1d1838cc, #1d1838ee)" }}
            initial={false}
            animate={{ opacity: startedAt !== null && !visible ? 1 : 0 }}
          >
            <span className="font-display text-3xl text-muted">Count in your head…</span>
          </motion.div>
        </div>
        {p.bonus && <p className="text-accent">Bonus: the timer stays visible for 3 s</p>}
      </Arena>
      <KeyHint text="Start and stop: tap or press" />
      {startedAt === null ? (
        <ChunkyButton color="#ffc933" className="min-h-20 w-full text-3xl" onClick={() => setStartedAt(gameNow())}>Start</ChunkyButton>
      ) : (
        <ChunkyButton
          color="#ff4d5e"
          textColor="#fff"
          className="min-h-20 w-full text-3xl"
          onClick={() => {
            const e = gameNow() - startedAt;
            setResult(e);
            p.submit({ elapsedMs: e });
          }}
        >
          Stop!
        </ChunkyButton>
      )}
    </div>
  );
}
