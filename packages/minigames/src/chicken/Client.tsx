"use client";
import { motion } from "framer-motion";
import { useEffect, useRef } from "react";
import type { MinigameClientProps } from "../kit/types";
import { HoldButton, useFrameNow } from "../kit/hooks";
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

  return (
    <div className="flex flex-col items-center gap-4">
      <motion.div
        animate={p.pub.crashed ? { scale: [1.3, 0.9, 1], rotate: [0, -10, 10, 0] } : { scale: 1 + Math.min(pot, 400) / 800 }}
        className={`flex h-44 w-44 flex-col items-center justify-center rounded-full font-display ${p.pub.crashed ? "bg-bad" : "bg-accent"} text-[#241a00]`}
      >
        <span className="text-6xl tabular-nums">{pot}</span>
        <span className="text-lg">{p.pub.crashed ? "CRASHED!" : "in the pot"}</span>
      </motion.div>
      {!growing && !p.pub.crashed && <p className="font-display text-2xl">Grab the button! Starts in {Math.max(0, startsIn)}…</p>}
      {p.priv?.range && !p.pub.crashed && (
        <p className="rounded-full bg-panel-2 px-3 py-1 font-display text-accent">Bonus: crashes between {p.priv.range.lo} and {p.priv.range.hi}</p>
      )}
      <ul className="grid w-full grid-cols-2 gap-2">
        {p.participants.map((pid) => {
          const st = p.pub.status[pid];
          return (
            <li key={pid} className="flex items-center gap-2 rounded-2xl bg-bg-2 p-2">
              <p.ui.Avatar player={p.players[pid]} size={32} dim={st === "busted" || st === "out"} />
              <span className="flex-1 truncate font-display">{p.players[pid]?.name}</span>
              <span className={`font-display ${st === "cashed" ? "text-good" : st === "busted" || st === "out" ? "text-bad" : "text-muted"}`}>
                {st === "cashed" ? p.pub.cashed[pid] : st === "holding" ? "holding" : st === "busted" ? "busted" : st === "out" ? "out" : "…"}
              </span>
            </li>
          );
        })}
      </ul>
      {p.isParticipant && (myStatus === "waiting" || myStatus === "holding") && !p.pub.crashed && (
        <HoldButton
          label={growing ? "Hold!" : "Press & hold"}
          holdingLabel={growing ? "Let go to cash out!" : "Holding — get ready"}
          onChange={(hold) => p.input({ hold })}
        />
      )}
      {myStatus === "cashed" && <p className="font-display text-2xl text-good">Cashed out at {p.pub.cashed[p.me!]}!</p>}
    </div>
  );
}
