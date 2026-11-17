"use client";
import { useEffect, useRef, useState } from "react";
import type { SoloPrivate, SoloPublic } from "@party-game/shared";
import type { MinigameClientProps } from "../kit/types";
import { KeyHint, SoloStatus, SubmittedNotice, useKey } from "../kit/hooks";
import { ROUNDS, accuracy, barPos, rounds, zoneWidth } from "./logic";

export function StopTheBarClient(p: MinigameClientProps<SoloPublic, SoloPrivate>) {
  const keyAction = useRef<(() => void) | null>(null);
  keyAction.current = null;
  useKey(() => keyAction.current?.());
  const rs = rounds(p.seed ?? 1);
  const [stops, setStops] = useState<number[]>([]);
  const [frozen, setFrozen] = useState<number | null>(null);
  const start = useRef(performance.now());
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
  const t = frozen ?? performance.now() - start.current;
  const pos = barPos(t, r);
  const w = zoneWidth(p.bonus);
  const stop = () => {
    if (frozen !== null) return;
    const el = performance.now() - start.current;
    if (el < 150) return;
    setFrozen(el);
    const acc = accuracy(barPos(el, r), r, p.bonus);
    p.ui.play(acc > 0 ? "coin" : "miss");
    setTimeout(() => {
      const next = [...stops, el];
      setStops(next);
      setFrozen(null);
      start.current = performance.now();
      if (next.length >= ROUNDS) p.submit({ stops: next });
    }, 900);
  };
  keyAction.current = stop;
  return (
    <button onPointerDown={stop} className="flex w-full touch-none select-none flex-col gap-4 rounded-3xl bg-bg-2 p-5" data-testid="bar-field">
      <span className="font-display text-xl">
        Round {stops.length + 1}/{ROUNDS}
        {frozen !== null && <span className="ml-3 text-accent">{accuracy(pos, r, p.bonus)} pts</span>}
      </span>
      <div className="relative h-16 w-full overflow-hidden rounded-2xl bg-panel-2">
        <span className="absolute inset-y-0 bg-good/60" style={{ left: `${r.center - w / 2}%`, width: `${w}%` }} />
        <span className="absolute inset-y-0 w-0.5 bg-white/70" style={{ left: `${r.center}%` }} />
        <span className="absolute inset-y-1 w-2 rounded bg-accent shadow-[0_0_12px_#ffc933]" style={{ left: `calc(${pos}% - 4px)` }} />
      </div>
      <span className="text-muted">Tap anywhere to stop <KeyHint /> {p.bonus && "· Bonus: wider zone"}</span>
    </button>
  );
}
