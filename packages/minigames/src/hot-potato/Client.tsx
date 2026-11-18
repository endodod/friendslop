"use client";
import { motion } from "framer-motion";
import { useEffect, useRef } from "react";
import type { MinigameClientProps } from "../kit/types";
import { Arena, ChunkyButton } from "../kit/visual";

interface Pub { alive: string[]; out: string[]; holder: string; prompt: { text: string; choices: number[] } | null; boom: string | null; locked: boolean; immune: boolean }

export function HotPotatoClient(p: MinigameClientProps<Pub>) {
  const mine = p.isParticipant && p.pub.holder === p.me && !p.pub.boom;
  const lastBoom = useRef<string | null>(null);
  useEffect(() => {
    if (p.pub.boom && p.pub.boom !== lastBoom.current) {
      p.ui.play("pop");
      p.ui.vibrate([200, 60, 200]);
    }
    lastBoom.current = p.pub.boom;
  }, [p.pub.boom, p.ui]);
  useEffect(() => {
    if (mine) p.ui.vibrate(40);
  }, [mine, p.ui]);
  const n = p.participants.length;
  const holderIdx = p.participants.indexOf(p.pub.holder);
  const posOf = (i: number) => {
    const ang = (i / n) * Math.PI * 2 - Math.PI / 2;
    return { x: 50 + Math.cos(ang) * 38, y: 50 + Math.sin(ang) * 38 };
  };
  const bombPos = holderIdx >= 0 ? posOf(holderIdx) : { x: 50, y: 50 };
  return (
    <div className="flex flex-col items-center gap-4">
      <Arena
        tone={mine ? "#ff4d5e" : "#ff8a3d"}
        className="relative aspect-square w-full max-w-[min(100%,42dvh)]"
        bg={`radial-gradient(60% 60% at 50% 50%, ${p.pub.boom ? "#ff4d5e55" : "#ff8a3d33"} 0%, transparent 70%), linear-gradient(180deg, #1d1838, #120f24)`}
      >
        {/* circle */}
        <span className="absolute inset-[12%] rounded-full border-2 border-dashed border-white/15" />
        {p.participants.map((pid, i) => {
          const pos = posOf(i);
          const alive = p.pub.alive.includes(pid);
          return (
            <span
              key={pid}
              className={`absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5 ${alive ? "" : "opacity-40 grayscale"}`}
              style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
            >
              <p.ui.Avatar player={p.players[pid]} size={52} dim={!alive} ring={p.pub.holder === pid} />
              <span className="max-w-20 truncate font-display text-sm">{p.players[pid]?.name}</span>
            </span>
          );
        })}
        {/* the bomb flies to its holder */}
        {!p.pub.boom && holderIdx >= 0 && (
          <motion.span
            className="absolute -translate-x-1/2 -translate-y-1/2"
            animate={{ left: `${50 + (bombPos.x - 50) * 0.38}%`, top: `${50 + (bombPos.y - 50) * 0.38}%` }}
            transition={{ type: "spring", stiffness: 160, damping: 14 }}
          >
            <motion.span
              className="relative block"
              animate={{ rotate: [-12, 12, -12], scale: [1, 1.08, 1] }}
              transition={{ repeat: Infinity, duration: 0.35 }}
            >
              <span
                className="flex h-16 w-16 items-center justify-center rounded-full"
                style={{ background: "radial-gradient(circle at 35% 30%, #ff9a6b, #ff4d5e 55%, #8f1323)", boxShadow: "0 0 26px #ff4d5e, inset 0 -4px 0 #0004" }}
              >
                <p.ui.Icon id="bomb" size={40} className="text-[#14112a]" />
              </span>
              <motion.span
                aria-hidden
                className="absolute right-0 top-0 h-3 w-3 rounded-full bg-accent"
                animate={{ opacity: [1, 0.3, 1], scale: [1, 1.6, 1] }}
                transition={{ repeat: Infinity, duration: 0.25 }}
                style={{ boxShadow: "0 0 10px #ffc933" }}
              />
            </motion.span>
          </motion.span>
        )}
        {p.pub.boom && (
          <motion.span
            className="absolute inset-0 flex items-center justify-center"
            initial={{ scale: 0.3, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
          >
            <span className="font-display text-6xl text-accent drop-shadow-[0_0_20px_#ff4d5e]">BOOM!</span>
          </motion.span>
        )}
      </Arena>
      {p.pub.boom ? (
        <p className="font-display text-3xl text-bad">{p.players[p.pub.boom]?.name} is out!</p>
      ) : mine ? (
        <div className="flex w-full flex-col items-center gap-3">
          <p className="font-display text-2xl text-bad">You have the bomb! Solve to pass it:</p>
          {p.pub.immune ? (
            <p className="font-display text-xl text-good">Immune! Passing automatically…</p>
          ) : (
            <>
              <p className="font-display text-6xl">{p.pub.prompt?.text}</p>
              <div className="grid w-full grid-cols-3 gap-2">
                {p.pub.prompt?.choices.map((c) => (
                  <ChunkyButton key={c} disabled={p.pub.locked} color="#3a3462" textColor="#f4f1ff" className="min-h-20 text-3xl" onClick={() => p.input({ choice: c })}>
                    {c}
                  </ChunkyButton>
                ))}
              </div>
            </>
          )}
        </div>
      ) : (
        <p className="font-display text-2xl">{p.players[p.pub.holder]?.name} has the bomb…</p>
      )}
    </div>
  );
}
