"use client";
import { motion } from "framer-motion";
import { useEffect, useRef } from "react";
import type { MinigameClientProps } from "../kit/types";
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
  return (
    <div className="flex flex-col gap-3">
      <p className="text-center font-display text-2xl">
        {p.pub.boom ? `BOOM! ${p.players[p.pub.boom.playerId]?.name} is out!` : myTurn ? "Your turn — pick a tile!" : `${p.players[p.pub.current ?? ""]?.name ?? ""}'s turn`}
      </p>
      {!p.pub.boom && <p.ui.Timer endsAt={p.pub.turnEndsAt} totalMs={TURN_MS} />}
      <div className="mx-auto grid w-full max-w-sm grid-cols-4 gap-2">
        {Array.from({ length: TILES }, (_, i) => {
          const opened = p.pub.opened.includes(i);
          const boom = p.pub.boom?.tile === i;
          return (
            <motion.button
              key={`${p.pub.grid}-${i}`}
              animate={boom ? { scale: [1, 1.4, 1] } : {}}
              disabled={!myTurn || opened}
              onClick={() => p.input({ tile: i })}
              aria-label={opened ? (boom ? "bomb" : "safe") : `tile ${i + 1}`}
              className={`flex aspect-square items-center justify-center rounded-2xl ${boom ? "bg-bad" : opened ? "bg-good/30" : "bg-panel-2"} ${p.priv?.safe === i ? "ring-4 ring-good" : ""}`}
            >
              {boom ? <p.ui.Icon id="mine" size={40} /> : opened ? "✓" : ""}
            </motion.button>
          );
        })}
      </div>
      {p.priv?.safe != null && <p className="text-center text-good">Bonus: the green-ringed tile is safe.</p>}
      <ul className="flex justify-center gap-2">
        {p.participants.map((pid) => (
          <li key={pid}>
            <p.ui.Avatar player={p.players[pid]} size={36} dim={!p.pub.alive.includes(pid)} ring={p.pub.current === pid} />
          </li>
        ))}
      </ul>
    </div>
  );
}
