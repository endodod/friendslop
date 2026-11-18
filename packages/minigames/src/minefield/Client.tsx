"use client";
import { motion } from "framer-motion";
import { useEffect, useRef } from "react";
import type { MinigameClientProps } from "../kit/types";
import { Arena } from "../kit/visual";
import { TILES, TURN_MS } from "./logic";

interface Pub { alive: string[]; out: string[]; opened: number[]; current: string | null; turnEndsAt: number; boom: { tile: number; playerId: string } | null; grid: number }

export function MinefieldClient(p: MinigameClientProps<Pub, { safe: number | null }>) {
  const myTurn = p.isParticipant && p.pub.current === p.me;
  const boomKey = p.pub.boom ? `${p.pub.grid}-${p.pub.boom.tile}` : null;
  const last = useRef<string | null>(null);
  useEffect(() => {
    if (boomKey && boomKey !== last.current) {
      p.ui.play("pop");
      p.ui.vibrate([150, 50, 150]);
    }
    last.current = boomKey;
  }, [boomKey, p.ui]);
  const cur = p.pub.current ? p.players[p.pub.current] : undefined;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-center gap-3">
        {!p.pub.boom && cur && <p.ui.Avatar player={cur} size={40} ring />}
        <motion.p
          key={`${p.pub.current}-${!!p.pub.boom}`}
          initial={{ y: -8, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className={`font-display text-2xl ${p.pub.boom ? "text-bad" : myTurn ? "text-accent" : ""}`}
        >
          {p.pub.boom ? `BOOM! ${p.players[p.pub.boom.playerId]?.name} is out!` : myTurn ? "Your turn — pick a tile!" : `${cur?.name ?? ""}'s turn`}
        </motion.p>
      </div>
      {!p.pub.boom && <p.ui.Timer endsAt={p.pub.turnEndsAt} totalMs={TURN_MS} />}
      <Arena
        tone={p.pub.boom ? "#ff4d5e" : "#2fd27a"}
        className={`p-3 ${p.pub.boom ? "shake" : ""}`}
        bg="radial-gradient(90% 80% at 50% 30%, #3f7a3a 0%, #2a5a2a 60%, #1d401f 100%)"
        pattern="dots"
      >
        <div className="mx-auto grid w-full max-w-sm grid-cols-4 gap-2">
          {Array.from({ length: TILES }, (_, i) => {
            const opened = p.pub.opened.includes(i);
            const boom = p.pub.boom?.tile === i;
            const safeHint = p.priv?.safe === i;
            return (
              <motion.button
                key={`${p.pub.grid}-${i}`}
                animate={boom ? { scale: [1, 1.4, 1] } : {}}
                whileTap={myTurn && !opened ? { scale: 0.9 } : undefined}
                disabled={!myTurn || opened}
                onClick={() => p.input({ tile: i })}
                aria-label={opened ? (boom ? "bomb" : "safe") : `tile ${i + 1}`}
                className="relative flex aspect-square items-center justify-center rounded-2xl transition-[filter] disabled:cursor-default"
                style={{
                  background: boom
                    ? "radial-gradient(circle, #fff3a0 0%, #ff8a3d 35%, #ff4d5e 70%)"
                    : opened
                      ? "radial-gradient(circle at 50% 40%, #6b4424, #4a2d17)"
                      : "linear-gradient(160deg, #7ed36a, #4fa845 60%, #3a8a35)",
                  boxShadow: opened || boom ? "inset 0 4px 10px #0008" : "inset 0 3px 0 #ffffff55, 0 5px 0 #24561f",
                  filter: myTurn && !opened ? "brightness(1.08)" : undefined,
                  outline: safeHint ? "4px solid #2fd27a" : undefined,
                  outlineOffset: 2,
                }}
              >
                {boom ? (
                  <p.ui.Icon id="mine" size={40} className="text-[#14112a]" />
                ) : opened ? (
                  <span className="font-display text-2xl text-good">✓</span>
                ) : null}
                {boom &&
                  Array.from({ length: 8 }, (_, k) => (
                    <motion.span
                      key={k}
                      aria-hidden
                      className="absolute h-2.5 w-2.5 rounded-full bg-accent"
                      initial={{ x: 0, y: 0, opacity: 1 }}
                      animate={{ x: Math.cos((k / 8) * Math.PI * 2) * 70, y: Math.sin((k / 8) * Math.PI * 2) * 70, opacity: 0 }}
                      transition={{ duration: 0.6 }}
                    />
                  ))}
              </motion.button>
            );
          })}
        </div>
      </Arena>
      {p.priv?.safe != null && <p className="text-center text-good">Bonus: the green-ringed tile is safe.</p>}
      <ul className="flex justify-center gap-2">
        {p.participants.map((pid) => (
          <li key={pid} className={p.pub.alive.includes(pid) ? "" : "opacity-40 grayscale"}>
            <p.ui.Avatar player={p.players[pid]} size={36} dim={!p.pub.alive.includes(pid)} ring={p.pub.current === pid} />
          </li>
        ))}
      </ul>
    </div>
  );
}
