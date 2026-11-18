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
  const grab = stage === "grab";
  return (
    <div className="flex flex-col gap-3">
      <motion.p
        key={stage}
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className={`text-center font-display text-3xl ${grab ? "text-accent drop-shadow-[0_0_12px_#ffc933]" : ""}`}
      >
        {stage === "music" ? "♪ Music is playing… ♪" : grab ? "SIT DOWN!" : `Round ${p.pub.round} over`}
      </motion.p>
      <div
        className="relative mx-auto aspect-square w-full max-w-[min(100%,52dvh)] overflow-hidden rounded-[28px]"
        style={{
          background:
            "repeating-conic-gradient(#2a1f5e 0 25%, #1a1440 0 50%) 0 0 / 25% 25%",
          boxShadow: `inset 0 0 0 3px ${grab ? "#ffc933" : "#b26bff"}88, inset 0 0 60px #000c, 0 12px 30px #0008`,
        }}
      >
        {stage === "music" && (
          <>
            {["#ff4d5e", "#3d8bff", "#2fd27a", "#ffc933"].map((c, i) => (
              <motion.span
                key={c}
                aria-hidden
                className="pointer-events-none absolute left-1/2 top-1/2 h-[160%] w-[18%] origin-top -translate-x-1/2 mix-blend-screen"
                style={{ background: `linear-gradient(180deg, ${c}88, transparent 80%)`, top: "-30%" }}
                animate={{ rotate: [i * 90 - 40, i * 90 + 40, i * 90 - 40] }}
                transition={{ repeat: Infinity, duration: 2.4 + i * 0.3, ease: "easeInOut" }}
              />
            ))}
            {[0, 1, 2, 3, 4].map((i) => (
              <motion.span
                key={`n${i}`}
                aria-hidden
                className="pointer-events-none absolute font-display text-3xl text-white/70"
                style={{ left: `${10 + i * 18}%` }}
                initial={{ top: "95%", opacity: 0 }}
                animate={{ top: ["95%", "5%"], opacity: [0, 1, 0], rotate: [0, 20, -20] }}
                transition={{ repeat: Infinity, duration: 3, delay: i * 0.55 }}
              >
                {i % 2 ? "♪" : "♫"}
              </motion.span>
            ))}
          </>
        )}
        {stage === "music" && !chairs && (
          <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 3, ease: "linear" }} className="absolute inset-0 flex items-center justify-center">
            <span
              className="flex h-28 w-28 items-center justify-center rounded-full"
              style={{ background: "radial-gradient(circle at 35% 30%, #fff, #b8b8d8 30%, #6a6a8a 70%)", boxShadow: "0 0 40px #fff8" }}
            >
              <p.ui.Icon id="music" size={56} className="text-[#2a1f5e]" />
            </span>
          </motion.div>
        )}
        {chairs?.map((c, i) => {
          const who = seated[i];
          return (
            <motion.button
              key={`${p.pub.round}-${i}`}
              initial={{ scale: 0, rotate: -30 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 15, delay: i * 0.03 }}
              disabled={!p.isParticipant || !meAlive || !!who || mySeat !== undefined}
              onPointerDown={() => {
                p.input({ chair: i });
                p.ui.vibrate(30);
              }}
              aria-label={who ? `chair taken by ${p.players[who]?.name}` : `chair ${i + 1}`}
              className="absolute flex h-[22%] w-[22%] min-h-14 min-w-14 -translate-x-1/2 -translate-y-1/2 touch-none items-center justify-center rounded-3xl"
              style={{
                left: `${12 + c.x * 0.8}%`,
                top: `${12 + c.y * 0.9}%`,
                background: who ? "linear-gradient(180deg, #3a3462, #241f45)" : "linear-gradient(180deg, #ffe08a, #ffc933 55%, #d9a514)",
                boxShadow: who ? "0 4px 0 #15122b, 0 8px 16px #0008" : "0 6px 0 #b38a12, 0 0 24px #ffc93399, inset 0 2px 0 #fff8",
              }}
            >
              {who ? <p.ui.Avatar player={p.players[who]} size={60} /> : <p.ui.Icon id="chairs" size={54} className="text-[#241a00]" />}
            </motion.button>
          );
        })}
      </div>
      {p.priv?.bonus && stage === "music" && <p className="text-center text-accent">Bonus: you&apos;ll see the chairs a moment early</p>}
      <ul className="flex flex-wrap justify-center gap-2">
        {p.participants.map((pid) => (
          <li key={pid} className={alive.includes(pid) ? "" : "grayscale"}>
            <p.ui.Avatar player={p.players[pid]} size={36} dim={!alive.includes(pid)} ring={Object.values(seated).includes(pid)} />
          </li>
        ))}
      </ul>
    </div>
  );
}
