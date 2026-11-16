"use client";
import { motion } from "framer-motion";
import { useEffect, useRef } from "react";
import type { MinigameClientProps } from "../kit/types";

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
  return (
    <div className="flex flex-col items-center gap-4">
      <ul className="flex flex-wrap justify-center gap-4">
        {p.participants.map((pid) => (
          <li key={pid} className="relative flex flex-col items-center gap-1">
            <p.ui.Avatar player={p.players[pid]} size={56} dim={!p.pub.alive.includes(pid)} ring={p.pub.holder === pid} />
            {p.pub.holder === pid && !p.pub.boom && (
              <motion.span animate={{ rotate: [-10, 10, -10] }} transition={{ repeat: Infinity, duration: 0.3 }} className="absolute -top-5">
                <p.ui.Icon id="bomb" size={30} className="text-bad" />
              </motion.span>
            )}
          </li>
        ))}
      </ul>
      {p.pub.boom ? (
        <p className="font-display text-4xl text-bad">BOOM! {p.players[p.pub.boom]?.name} is out!</p>
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
                  <button key={c} disabled={p.pub.locked} className="btn-secondary min-h-20 text-3xl" onClick={() => p.input({ choice: c })}>
                    {c}
                  </button>
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
