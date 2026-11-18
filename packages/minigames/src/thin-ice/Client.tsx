"use client";
import { motion } from "framer-motion";
import type { MinigameClientProps } from "../kit/types";
import { Arena } from "../kit/visual";
import { SIZE, TURN_MS, neighbors } from "./logic";

interface Pub { pos: Record<string, number>; broken: number[]; alive: string[]; current: string | null; turnEndsAt: number }

export function ThinIceClient(p: MinigameClientProps<Pub>) {
  const myTurn = p.isParticipant && p.pub.current === p.me;
  const occupied = new Map(p.pub.alive.map((pid) => [p.pub.pos[pid], pid]));
  const valid = myTurn && p.me ? neighbors(p.pub.pos[p.me]).filter((c) => !p.pub.broken.includes(c) && !occupied.has(c)) : [];
  const cur = p.pub.current ? p.players[p.pub.current] : undefined;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-center gap-3">
        {cur && <p.ui.Avatar player={cur} size={40} ring />}
        <p className={`font-display text-2xl ${myTurn ? "text-accent" : ""}`}>
          {myTurn ? "Your move!" : p.pub.current ? `${cur?.name}'s move` : "Done!"}
        </p>
      </div>
      {p.pub.current && <p.ui.Timer endsAt={p.pub.turnEndsAt} totalMs={TURN_MS} />}
      <Arena tone="#7fd3ff" className="p-3" pattern="none" bg="radial-gradient(100% 80% at 50% 0%, #1f4a7a 0%, #0c2440 70%, #071629 100%)">
        <div className="mx-auto grid w-full max-w-sm gap-1.5" style={{ gridTemplateColumns: `repeat(${SIZE}, 1fr)` }}>
          {Array.from({ length: SIZE * SIZE }, (_, c) => {
            const who = occupied.get(c);
            const broken = p.pub.broken.includes(c);
            const can = valid.includes(c);
            return (
              <motion.button
                key={c}
                disabled={!can}
                whileTap={can ? { scale: 0.9 } : undefined}
                animate={broken ? { scale: [1, 0.85, 0.92] } : { scale: 1 }}
                onClick={() => {
                  p.input({ cell: c });
                  p.ui.play("hop");
                }}
                aria-label={broken ? "hole" : who ? p.players[who]?.name : can ? "move here" : "ice"}
                className="relative flex aspect-square items-center justify-center overflow-hidden rounded-xl disabled:cursor-default"
                style={{
                  background: broken
                    ? "radial-gradient(circle at 50% 50%, #04101f 30%, #0b2a4a 70%, #1c4d7a)"
                    : can
                      ? "linear-gradient(150deg, #e8f8ff, #9fdcff 60%, #7fd3ff)"
                      : "linear-gradient(150deg, #f4fbff, #cdeeff 55%, #a8dcf5)",
                  boxShadow: broken
                    ? "inset 0 4px 10px #000c"
                    : can
                      ? "0 0 0 3px #ffc933, 0 0 16px #ffc933aa, inset 0 2px 0 #fff"
                      : "inset 0 2px 0 #fff, inset 0 -3px 0 #7fb8d8",
                }}
              >
                {!broken && (
                  <span aria-hidden className="pointer-events-none absolute left-[15%] top-[12%] h-[12%] w-[40%] -rotate-12 rounded-full bg-white/70" />
                )}
                {broken && (
                  <svg viewBox="0 0 40 40" className="absolute inset-0 h-full w-full opacity-60" aria-hidden>
                    <path d="M4 8 L14 18 L10 28 M14 18 L26 14 L36 6 M26 14 L30 30" stroke="#a8dcf5" strokeWidth="1.5" fill="none" />
                  </svg>
                )}
                {who && <p.ui.Avatar player={p.players[who]} size={34} ring={who === p.pub.current} />}
              </motion.button>
            );
          })}
        </div>
      </Arena>
      <ul className="flex justify-center gap-2">
        {p.participants.map((pid) => (
          <li key={pid} className={p.pub.alive.includes(pid) ? "" : "opacity-40 grayscale"}>
            <p.ui.Avatar player={p.players[pid]} size={32} dim={!p.pub.alive.includes(pid)} />
          </li>
        ))}
      </ul>
    </div>
  );
}
