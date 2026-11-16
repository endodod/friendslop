"use client";
import { motion } from "framer-motion";
import { useEffect, useRef } from "react";
import type { MinigameClientProps } from "../kit/types";
import type { ChairsPublic } from "./logic";

export function MusicalChairsClient(p: MinigameClientProps<ChairsPublic, { bonus: boolean; earlyChairs: { x: number; y: number }[] | null }>) {
  const { stage, seated, alive } = p.pub;
  const chairs = p.pub.chairs ?? p.priv?.earlyChairs ?? null;
  const lastStage = useRef(stage);
  useEffect(() => {
    if (stage === "music" && lastStage.current !== "music") p.ui.play("whoosh");
    if (stage === "grab") p.ui.play("go");
    lastStage.current = stage;
  }, [stage, p.ui]);
  // simple "music": a ticking beat while the music plays
  useEffect(() => {
    if (stage !== "music") return;
    const id = setInterval(() => p.ui.play("click", { rate: 0.8 + Math.random() * 0.6, volume: 0.3 }), 300);
    return () => clearInterval(id);
  }, [stage, p.ui]);
  const meAlive = !!p.me && alive.includes(p.me);
  const mySeat = Object.entries(seated).find(([, pid]) => pid === p.me)?.[0];
  return (
    <div className="flex flex-col gap-3">
      <p className="text-center font-display text-2xl">
        {stage === "music" ? "♪ Music is playing… ♪" : stage === "grab" ? "SIT DOWN!" : `Round ${p.pub.round} over`}
      </p>
      <div className="relative aspect-square w-full overflow-hidden rounded-3xl bg-bg-2">
        {stage === "music" && !chairs && (
          <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 3, ease: "linear" }} className="absolute inset-0 flex items-center justify-center">
            <p.ui.Icon id="music" size={90} className="text-accent" />
          </motion.div>
        )}
        {chairs?.map((c, i) => {
          const who = seated[i];
          return (
            <motion.button
              key={`${p.pub.round}-${i}`}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              disabled={!p.isParticipant || !meAlive || !!who || mySeat !== undefined}
              onPointerDown={() => {
                p.input({ chair: i });
                p.ui.vibrate(30);
              }}
              aria-label={who ? `chair taken by ${p.players[who]?.name}` : `chair ${i + 1}`}
              className="absolute flex h-24 w-24 -translate-x-1/2 -translate-y-1/2 touch-none items-center justify-center rounded-3xl bg-accent shadow-[0_6px_0_#b38a12]"
              style={{ left: `${c.x + 6}%`, top: `${c.y + 6}%` }}
            >
              {who ? <p.ui.Avatar player={p.players[who]} size={60} /> : <p.ui.Icon id="chairs" size={54} className="text-[#241a00]" />}
            </motion.button>
          );
        })}
      </div>
      {p.priv?.bonus && stage === "music" && <p className="text-center text-accent">Bonus: you&apos;ll see the chairs a moment early</p>}
      <ul className="flex flex-wrap justify-center gap-2">
        {p.participants.map((pid) => (
          <li key={pid}>
            <p.ui.Avatar player={p.players[pid]} size={36} dim={!alive.includes(pid)} />
          </li>
        ))}
      </ul>
    </div>
  );
}
