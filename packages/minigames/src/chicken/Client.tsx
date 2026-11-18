"use client";
import { motion } from "framer-motion";
import { useEffect, useRef } from "react";
import type { MinigameClientProps } from "../kit/types";
import { HoldButton, useFrameNow } from "../kit/hooks";
import { Arena, Pill, PlayerChip } from "../kit/visual";
import { potAt, type ChickenPublic } from "./logic";

export function ChickenClient(p: MinigameClientProps<ChickenPublic, { bonus: boolean; range: { lo: number; hi: number } | null }>) {
  const now = useFrameNow(p.now, !p.pub.crashed);
  const growing = now >= p.pub.growStartsAt && !p.pub.crashed;
  // Smooth local pot display between server updates (server value is authoritative).
  const pot = p.pub.crashed ? (p.pub.crashPot ?? p.pub.pot) : growing ? Math.max(p.pub.pot, potAt(now - p.pub.growStartsAt)) : p.pub.pot;
  const myStatus = p.me ? p.pub.status[p.me] : undefined;
  const crashedRef = useRef(false);
  useEffect(() => {
    if (p.pub.crashed && !crashedRef.current) {
      crashedRef.current = true;
      p.ui.play("pop");
      p.ui.vibrate([200]);
    }
  }, [p.pub.crashed, p.ui]);
  const startsIn = Math.ceil((p.pub.growStartsAt - now) / 1000);

  // Gauge: 0..1 over a typical crash range; colour runs yellow → orange → red.
  const heat = Math.min(1, pot / 300);
  const gaugeColor = p.pub.crashed ? "#ff4d5e" : heatColor(heat);
  const R = 78;
  const C = Math.PI * R * 1.5; // 270° arc
  const shake = p.pub.crashed ? 0 : heat * 3;

  return (
    <div className="flex flex-col items-center gap-4">
      <Arena
        tone={gaugeColor}
        className="flex w-full flex-col items-center gap-2 py-5"
        bg={`radial-gradient(70% 60% at 50% 45%, ${gaugeColor}${p.pub.crashed ? "55" : Math.round(32 + heat * 64).toString(16).padStart(2, "0")} 0%, transparent 70%), linear-gradient(180deg, #1d1838, #120f24)`}
      >
        <motion.div
          animate={
            p.pub.crashed
              ? { scale: [1.3, 0.9, 1], rotate: [0, -10, 10, 0] }
              : { x: [0, -shake, shake, 0], y: [0, shake / 2, -shake / 2, 0] }
          }
          transition={p.pub.crashed ? { duration: 0.5 } : { repeat: Infinity, duration: 0.18 }}
          className="relative h-52 w-52"
        >
          <svg viewBox="0 0 200 200" className="absolute inset-0 h-full w-full -rotate-[225deg]" aria-hidden>
            <circle cx="100" cy="100" r={R} fill="none" stroke="#ffffff14" strokeWidth="16" strokeDasharray={`${C} 999`} strokeLinecap="round" />
            <circle
              cx="100"
              cy="100"
              r={R}
              fill="none"
              stroke={gaugeColor}
              strokeWidth="16"
              strokeDasharray={`${C * (p.pub.crashed ? 1 : heat)} 999`}
              strokeLinecap="round"
              style={{ filter: `drop-shadow(0 0 8px ${gaugeColor})`, transition: "stroke-dasharray 0.1s linear" }}
            />
          </svg>
          <div
            className={`absolute inset-8 flex flex-col items-center justify-center rounded-full font-display ${p.pub.crashed ? "text-white" : "text-[#241a00]"}`}
            style={{
              background: p.pub.crashed
                ? "radial-gradient(circle at 40% 35%, #ff8a95, #ff4d5e 50%, #8f1323)"
                : `radial-gradient(circle at 40% 35%, #fff3c4, ${gaugeColor} 60%, color-mix(in srgb, ${gaugeColor} 60%, black))`,
              boxShadow: `0 0 ${20 + heat * 40}px ${gaugeColor}aa, inset 0 -6px 0 #0003`,
            }}
          >
            <span className="text-5xl tabular-nums leading-none">{pot}</span>
            <span className="text-base">{p.pub.crashed ? "CRASHED!" : "in the pot"}</span>
          </div>
          {p.pub.crashed &&
            Array.from({ length: 10 }, (_, i) => (
              <motion.span
                key={i}
                aria-hidden
                className="absolute left-1/2 top-1/2 h-3 w-3 rounded-full bg-accent"
                initial={{ x: 0, y: 0, opacity: 1 }}
                animate={{ x: Math.cos((i / 10) * Math.PI * 2) * 130, y: Math.sin((i / 10) * Math.PI * 2) * 130, opacity: 0 }}
                transition={{ duration: 0.7 }}
              />
            ))}
        </motion.div>
        {!growing && !p.pub.crashed && <p className="font-display text-2xl">Grab the button! Starts in {Math.max(0, startsIn)}…</p>}
        {p.priv?.range && !p.pub.crashed && <Pill tone="#ffc933">Bonus: crashes between {p.priv.range.lo} and {p.priv.range.hi}</Pill>}
      </Arena>
      <ul className="grid w-full grid-cols-2 gap-2">
        {p.participants.map((pid) => {
          const st = p.pub.status[pid];
          return (
            <PlayerChip
              key={pid}
              avatar={<p.ui.Avatar player={p.players[pid]} size={32} dim={st === "busted" || st === "out"} />}
              name={p.players[pid]?.name}
              highlight={st === "holding"}
              dim={st === "busted" || st === "out"}
              valueTone={st === "cashed" ? "#2fd27a" : st === "busted" || st === "out" ? "#ff4d5e" : "#a29cc6"}
              value={st === "cashed" ? `+${p.pub.cashed[pid]}` : st === "holding" ? "holding" : st === "busted" ? "busted" : st === "out" ? "out" : "…"}
            />
          );
        })}
      </ul>
      {p.isParticipant && (myStatus === "waiting" || myStatus === "holding") && !p.pub.crashed && (
        <HoldButton
          label={growing ? "Hold!" : "Press & hold"}
          holdingLabel={growing ? "Let go to cash out!" : "Holding — get ready"}
          color={growing ? gaugeColor : "#ffc933"}
          onChange={(hold) => p.input({ hold })}
        />
      )}
      {myStatus === "cashed" && (
        <motion.p initial={{ scale: 0.6 }} animate={{ scale: 1 }} className="font-display text-3xl text-good">
          Cashed out at {p.pub.cashed[p.me!]}!
        </motion.p>
      )}
    </div>
  );
}

/** Yellow → orange → red as the pot heats up (hex, so alpha suffixes work). */
function heatColor(t: number): string {
  const stops = [
    [255, 201, 51],
    [255, 138, 61],
    [255, 77, 94],
  ];
  const x = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const f = x - i;
  return (
    "#" +
    stops[i]
      .map((c, k) => Math.round(c + (stops[i + 1][k] - c) * f).toString(16).padStart(2, "0"))
      .join("")
  );
}
