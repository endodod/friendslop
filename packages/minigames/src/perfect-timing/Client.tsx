"use client";
import { useEffect, useRef, useState } from "react";
import type { SoloPrivate, SoloPublic } from "@party-game/shared";
import type { MinigameClientProps } from "../kit/types";
import { SoloStatus, SubmittedNotice } from "../kit/hooks";
import { GOAL_MS, VISIBLE_MS } from "./logic";

export function PerfectTimingClient(p: MinigameClientProps<SoloPublic, SoloPrivate>) {
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
        {p.isParticipant && result !== null && <SubmittedNotice label={`${(result / 1000).toFixed(2)} s`} />}
        <SoloStatus participants={p.participants} submitted={p.pub.submitted} labels={p.pub.labels} players={p.players} Avatar={p.ui.Avatar} />
      </div>
    );
  }
  const el = startedAt === null ? 0 : performance.now() - startedAt;
  const visible = el < (p.bonus ? VISIBLE_MS : 1000);
  return (
    <div className="flex flex-col items-center gap-6 py-4">
      <p className="font-display text-xl text-muted">Stop at exactly {GOAL_MS / 1000}.00 s</p>
      <p className="font-display text-7xl tabular-nums">{startedAt === null ? "0.00" : visible ? (el / 1000).toFixed(2) : "?.??"}</p>
      {p.bonus && <p className="text-accent">Bonus: the timer stays visible for 3 s</p>}
      {startedAt === null ? (
        <button className="btn-primary min-h-20 w-full text-3xl" onClick={() => setStartedAt(performance.now())}>Start</button>
      ) : (
        <button
          className="btn min-h-20 w-full bg-bad text-3xl text-white"
          onClick={() => {
            const e = performance.now() - startedAt;
            setResult(e);
            p.submit({ elapsedMs: e });
          }}
        >
          Stop!
        </button>
      )}
    </div>
  );
}
