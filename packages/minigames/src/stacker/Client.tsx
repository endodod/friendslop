"use client";
import { gameNow } from "../kit/clock";
import { useEffect, useRef, useState } from "react";
import type { SoloPrivate, SoloPublic } from "@party-game/shared";
import type { MinigameClientProps } from "../kit/types";
import { KeyHint, SoloStatus, SubmittedNotice, useKey } from "../kit/hooks";
import { Pill, PopText } from "../kit/visual";
import { FIELD, MAX_LEVELS, MIN_DROP_MS, simulate, sliderX, startWidth, type StackLevel } from "./logic";

const ROW = 7; // % of height per level
const BASE = 11; // % reserved at the bottom (ground + hint)
const COLORS = ["#3d8bff", "#ff4d5e", "#2fd27a", "#ffc933", "#b26bff", "#ff8a3d", "#ff6bc6", "#2fd6d0"];

export function StackerClient(p: MinigameClientProps<SoloPublic, SoloPrivate>) {
  const keyAction = useRef<(() => void) | null>(null);
  keyAction.current = null;
  useKey(() => keyAction.current?.());
  const seed = p.seed ?? 1;
  const [drops, setDrops] = useState<number[]>([]);
  const [done, setDone] = useState(false);
  const levelStart = useRef(gameNow());
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
    const t = gameNow() - levelStart.current;
    if (t < MIN_DROP_MS) return;
    const next = [...drops, t];
    const res = simulate(seed, p.bonus, next);
    setDrops(next);
    levelStart.current = gameNow();
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

  keyAction.current = drop;
  const movingX = sliderX(gameNow() - levelStart.current, top.w, level, seed);
  const scroll = Math.max(0, level - 8) * ROW;
  const prev = levels[levels.length - 2];
  const perfect = prev && drops.length > 0 && top.w >= prev.w - 0.5;
  return (
    <button
      onPointerDown={drop}
      className="relative h-[60dvh] w-full touch-none select-none overflow-hidden rounded-[28px]"
      style={{
        background:
          "radial-gradient(1.5px 1.5px at 20% 15%, #fff9, transparent), radial-gradient(1px 1px at 70% 25%, #fff8, transparent), radial-gradient(1.5px 1.5px at 45% 8%, #fff7, transparent), radial-gradient(1px 1px at 85% 45%, #fff6, transparent), radial-gradient(1px 1px at 10% 50%, #fff5, transparent), linear-gradient(180deg, #0b0a2a 0%, #2a1f5e 60%, #5e2a6e 100%)",
        boxShadow: "inset 0 0 0 2px #7b5cff55, 0 10px 30px #0008",
      }}
      aria-label="Drop block"
      data-testid="stacker-field"
    >
      {/* height markers every 5 levels */}
      {Array.from({ length: Math.ceil((level + 6) / 5) }, (_, k) => k * 5)
        .filter((h) => h > 0)
        .map((h) => (
          <span
            key={h}
            className="absolute inset-x-0 flex items-center gap-2 border-t border-dashed border-white/15 pl-2 text-xs text-white/40"
            style={{ bottom: `${h * ROW - scroll + BASE}%` }}
          >
            {h}
          </span>
        ))}
      <div className="absolute left-3 top-2 z-10 flex items-center gap-2">
        <Pill tone="#ffc933">{levels.length - 1} high</Pill>
      </div>
      {p.bonus && <span className="absolute right-3 top-2 z-10"><Pill tone="#2fd27a">Bonus: wider start</Pill></span>}
      {/* ground */}
      <span className="absolute inset-x-0 bg-[#1a1433]" style={{ bottom: 0, height: `${Math.max(0, BASE - scroll)}%`, boxShadow: "0 -2px 0 #7b5cff66" }} />
      {levels.map((l, i) => (
        <span
          key={i}
          className="absolute rounded-md"
          style={{
            left: `${(l.x / FIELD) * 100}%`,
            width: `${(l.w / FIELD) * 100}%`,
            bottom: `${i * ROW - scroll + BASE}%`,
            height: `${ROW - 0.6}%`,
            background: `linear-gradient(180deg, color-mix(in srgb, ${COLORS[i % COLORS.length]} 100%, white 25%), ${COLORS[i % COLORS.length]} 60%, color-mix(in srgb, ${COLORS[i % COLORS.length]} 70%, black))`,
            boxShadow: "inset 0 2px 0 #fff6, inset 0 -3px 0 #0004, 0 3px 8px #0006",
          }}
        />
      ))}
      <span
        className="absolute rounded-md"
        style={{
          left: `${(movingX / FIELD) * 100}%`,
          width: `${(top.w / FIELD) * 100}%`,
          bottom: `${level * ROW - scroll + BASE}%`,
          height: `${ROW - 0.6}%`,
          background: `linear-gradient(180deg, color-mix(in srgb, ${COLORS[level % COLORS.length]} 100%, white 35%), ${COLORS[level % COLORS.length]})`,
          boxShadow: `0 0 0 3px #fff, 0 0 24px ${COLORS[level % COLORS.length]}`,
        }}
      />
      <span className="absolute left-1/2 top-1/3 -translate-x-1/2">
        <PopText id={perfect ? drops.length : null} text="PERFECT!" color="#ffc933" />
      </span>
      <span className="absolute bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/40 px-3 py-1 text-sm text-white/80">
        Tap anywhere to drop <KeyHint />
      </span>
      <span className="sr-only">Start width {startWidth(p.bonus)}</span>
    </button>
  );
}
