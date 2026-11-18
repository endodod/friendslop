"use client";
import { gameNow } from "../kit/clock";
import { useEffect, useRef, useState } from "react";
import type { SoloPrivate, SoloPublic } from "@party-game/shared";
import type { MinigameClientProps } from "../kit/types";
import { KeyHint, SoloStatus, SubmittedNotice, useKey } from "../kit/hooks";
import { Hud, Pill, PopText, RoundDots } from "../kit/visual";
import { ROUNDS, accuracy, barPos, rounds, zoneWidth } from "./logic";

export function StopTheBarClient(p: MinigameClientProps<SoloPublic, SoloPrivate>) {
  const keyAction = useRef<(() => void) | null>(null);
  keyAction.current = null;
  useKey(() => keyAction.current?.());
  const rs = rounds(p.seed ?? 1);
  const [stops, setStops] = useState<number[]>([]);
  const [frozen, setFrozen] = useState<number | null>(null);
  const start = useRef(gameNow());
  const [, force] = useState(0);
  const done = stops.length >= ROUNDS;
  useEffect(() => {
    if (done || frozen !== null) return;
    let id = 0;
    const loop = () => (force((n) => n + 1), (id = requestAnimationFrame(loop)));
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [done, frozen]);

  if (!p.isParticipant || p.priv?.submitted || done) {
    const total = stops.reduce((s, t, i) => s + accuracy(barPos(t, rs[i]), rs[i], p.bonus), 0);
    return (
      <div className="flex flex-col gap-3">
        {p.isParticipant && <SubmittedNotice label={`${total} points`} />}
        <SoloStatus participants={p.participants} submitted={p.pub.submitted} labels={p.pub.labels} players={p.players} Avatar={p.ui.Avatar} />
      </div>
    );
  }
  const r = rs[stops.length];
  const t = frozen ?? gameNow() - start.current;
  const pos = barPos(t, r);
  const w = zoneWidth(p.bonus);
  const stop = () => {
    if (frozen !== null) return;
    const el = gameNow() - start.current;
    if (el < 150) return;
    setFrozen(el);
    const acc = accuracy(barPos(el, r), r, p.bonus);
    p.ui.play(acc > 0 ? "coin" : "miss");
    setTimeout(() => {
      const next = [...stops, el];
      setStops(next);
      setFrozen(null);
      start.current = gameNow();
      if (next.length >= ROUNDS) p.submit({ stops: next });
    }, 900);
  };
  keyAction.current = stop;
  const scores = stops.map((t, i) => accuracy(barPos(t, rs[i]), rs[i], p.bonus));
  const total = scores.reduce((x, y) => x + y, 0);
  const acc = frozen !== null ? accuracy(pos, r, p.bonus) : null;
  const verdict = acc === null ? null : acc >= 95 ? "PERFECT!" : acc >= 80 ? "Great!" : acc > 0 ? "Good" : "Miss";
  return (
    <div className="flex flex-col gap-3">
      <Hud
        left={<RoundDots total={ROUNDS} done={stops.length} colors={scores.map((x) => (x > 0 ? "#2fd27a" : "#ff4d5e"))} />}
        right={<Pill tone="#ffc933">{total} pts</Pill>}
      />
      <button
        onPointerDown={stop}
        className="relative flex w-full touch-none select-none flex-col gap-6 overflow-hidden rounded-[28px] px-4 pb-6 pt-10"
        style={{
          background: "radial-gradient(120% 80% at 50% 0%, #3d8bff33, transparent 60%), linear-gradient(180deg, #1d1838, #120f24)",
          boxShadow: "inset 0 0 0 2px #3d8bff55, 0 10px 30px #0008",
        }}
        data-testid="bar-field"
      >
        <span className="absolute left-1/2 top-4 -translate-x-1/2">
          <PopText id={verdict ? `${stops.length}-${verdict}` : null} text={`${verdict} ${acc ? `+${acc}` : ""}`} color={acc ? "#ffc933" : "#ff4d5e"} />
        </span>
        <div className="relative h-20 w-full">
          {/* track */}
          <div className="absolute inset-y-3 inset-x-0 overflow-hidden rounded-full bg-black/50 shadow-[inset_0_3px_8px_#000]">
            {Array.from({ length: 21 }, (_, i) => (
              <span key={i} className="absolute inset-y-2 w-px bg-white/10" style={{ left: `${i * 5}%`, top: i % 5 === 0 ? 4 : 14 }} />
            ))}
            <span
              className="absolute inset-y-0"
              style={{
                left: `${r.center - w / 2}%`,
                width: `${w}%`,
                background: "linear-gradient(90deg, #2fd27a33, #2fd27acc 45%, #ffc933 50%, #2fd27acc 55%, #2fd27a33)",
                boxShadow: "0 0 16px #2fd27a88",
              }}
            />
          </div>
          {/* needle */}
          <span
            className="absolute inset-y-0 flex w-4 -translate-x-1/2 flex-col items-center"
            style={{ left: `${pos}%` }}
          >
            <span className="h-0 w-0 border-x-[8px] border-t-[10px] border-x-transparent border-t-white" />
            <span className={`w-1.5 flex-1 rounded-full ${frozen !== null ? (acc ? "bg-accent" : "bg-bad") : "bg-white"}`} style={{ boxShadow: "0 0 14px #fff" }} />
            <span className="h-0 w-0 border-x-[8px] border-b-[10px] border-x-transparent border-b-white" />
          </span>
        </div>
        <span className="text-center text-muted">
          Round {stops.length + 1}/{ROUNDS} · tap anywhere to stop <KeyHint />
          {p.bonus && <span className="block text-accent">Bonus: wider zone</span>}
        </span>
      </button>
    </div>
  );
}
