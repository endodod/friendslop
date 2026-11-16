"use client";
import { useEffect, useRef, useState } from "react";
import type { SoloPrivate, SoloPublic } from "@party-game/shared";
import type { MinigameClientProps } from "../kit/types";
import { SoloStatus, SubmittedNotice } from "../kit/hooks";
import { FIELD, MAX_LEVELS, MIN_DROP_MS, simulate, sliderX, startWidth, type StackLevel } from "./logic";

const ROW = 7; // % of height per level
const COLORS = ["#3d8bff", "#ff4d5e", "#2fd27a", "#ffc933", "#b26bff", "#ff8a3d", "#ff6bc6", "#2fd6d0"];

export function StackerClient(p: MinigameClientProps<SoloPublic, SoloPrivate>) {
  const seed = p.seed ?? 1;
  const [drops, setDrops] = useState<number[]>([]);
  const [done, setDone] = useState(false);
  const levelStart = useRef(performance.now());
  const [, force] = useState(0);
  const sim = simulate(seed, p.bonus, drops);
  const levels: StackLevel[] = sim.levels;
  const level = levels.length; // index of moving block
  const top = levels[levels.length - 1];

  useEffect(() => {
    if (done) return;
    let id = 0;
    const loop = () => {
      force((n) => n + 1);
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [done]);

  const finish = (d: number[]) => {
    setDone(true);
    p.submit({ drops: d });
  };

  const drop = () => {
    if (done) return;
    const t = performance.now() - levelStart.current;
    if (t < MIN_DROP_MS) return;
    const next = [...drops, t];
    const res = simulate(seed, p.bonus, next);
    setDrops(next);
    levelStart.current = performance.now();
    if (res.failedAt !== null) {
      p.ui.play("bad");
      p.ui.vibrate(120);
      finish(next);
    } else {
      p.ui.play("hop", { rate: 0.8 + next.length * 0.05 });
      if (next.length >= MAX_LEVELS) finish(next);
    }
  };

  if (!p.isParticipant || p.priv?.submitted || done) {
    return (
      <div className="flex flex-col gap-3">
        {p.isParticipant && <SubmittedNotice label={`${levels.length - 1} blocks high`} />}
        <SoloStatus participants={p.participants} submitted={p.pub.submitted} labels={p.pub.labels} players={p.players} Avatar={p.ui.Avatar} />
      </div>
    );
  }

  const movingX = sliderX(performance.now() - levelStart.current, top.w, level, seed);
  const scroll = Math.max(0, level - 9) * ROW;
  return (
    <button
      onPointerDown={drop}
      className="relative h-[60dvh] w-full touch-none select-none overflow-hidden rounded-3xl bg-bg-2"
      aria-label="Drop block"
      data-testid="stacker-field"
    >
      <span className="absolute left-3 top-2 z-10 font-display text-2xl">{levels.length - 1} blocks</span>
      {p.bonus && <span className="absolute right-3 top-2 z-10 rounded-full bg-accent px-2 text-sm text-[#241a00]">Bonus: wider start</span>}
      {levels.map((l, i) => (
        <span
          key={i}
          className="absolute rounded-md"
          style={{
            left: `${(l.x / FIELD) * 100}%`,
            width: `${(l.w / FIELD) * 100}%`,
            bottom: `${i * ROW - scroll + 2}%`,
            height: `${ROW - 0.6}%`,
            background: COLORS[i % COLORS.length],
          }}
        />
      ))}
      <span
        className="absolute rounded-md opacity-90"
        style={{
          left: `${(movingX / FIELD) * 100}%`,
          width: `${(top.w / FIELD) * 100}%`,
          bottom: `${level * ROW - scroll + 2}%`,
          height: `${ROW - 0.6}%`,
          background: COLORS[level % COLORS.length],
          outline: "3px solid white",
        }}
      />
      <span className="absolute bottom-2 left-1/2 -translate-x-1/2 text-sm text-muted">Tap anywhere to drop</span>
      <span className="sr-only">Start width {startWidth(p.bonus)}</span>
    </button>
  );
}
