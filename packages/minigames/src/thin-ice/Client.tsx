"use client";
import type { MinigameClientProps } from "../kit/types";
import { SIZE, TURN_MS, neighbors } from "./logic";

interface Pub { pos: Record<string, number>; broken: number[]; alive: string[]; current: string | null; turnEndsAt: number }

export function ThinIceClient(p: MinigameClientProps<Pub>) {
  const myTurn = p.isParticipant && p.pub.current === p.me;
  const occupied = new Map(p.pub.alive.map((pid) => [p.pub.pos[pid], pid]));
  const valid = myTurn && p.me ? neighbors(p.pub.pos[p.me]).filter((c) => !p.pub.broken.includes(c) && !occupied.has(c)) : [];
  return (
    <div className="flex flex-col gap-3">
      <p className="text-center font-display text-2xl">
        {myTurn ? "Your move!" : p.pub.current ? `${p.players[p.pub.current]?.name}'s move` : "Done!"}
      </p>
      {p.pub.current && <p.ui.Timer endsAt={p.pub.turnEndsAt} totalMs={TURN_MS} />}
      <div className="mx-auto grid w-full max-w-sm gap-1.5" style={{ gridTemplateColumns: `repeat(${SIZE}, 1fr)` }}>
        {Array.from({ length: SIZE * SIZE }, (_, c) => {
          const who = occupied.get(c);
          const broken = p.pub.broken.includes(c);
          const can = valid.includes(c);
          return (
            <button
              key={c}
              disabled={!can}
              onClick={() => {
                p.input({ cell: c });
                p.ui.play("hop");
              }}
              aria-label={broken ? "hole" : who ? p.players[who]?.name : can ? "move here" : "ice"}
              className={`flex aspect-square items-center justify-center rounded-xl transition-colors ${
                broken ? "bg-[#0a0818]" : can ? "bg-[#7fd3ff] ring-4 ring-accent" : "bg-[#bfe9ff]"
              }`}
            >
              {who && <p.ui.Avatar player={p.players[who]} size={34} ring={who === p.pub.current} />}
            </button>
          );
        })}
      </div>
      <ul className="flex justify-center gap-2">
        {p.participants.map((pid) => (
          <li key={pid}>
            <p.ui.Avatar player={p.players[pid]} size={32} dim={!p.pub.alive.includes(pid)} />
          </li>
        ))}
      </ul>
    </div>
  );
}
