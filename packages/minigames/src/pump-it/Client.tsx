"use client";
import { motion } from "framer-motion";
import type { MinigameClientProps } from "../kit/types";
import { BALLOONS, type PumpPrivate, type PumpPublic } from "./logic";

const COLORS = ["#ff4d5e", "#3d8bff", "#2fd27a"];

export function PumpItClient(p: MinigameClientProps<PumpPublic, PumpPrivate>) {
  const mine = p.me ? p.pub.runs[p.me] : undefined;
  const others = p.participants.filter((x) => x !== p.me || !p.isParticipant);
  const cur = mine && mine.current < BALLOONS ? mine.balloons[mine.current] : null;
  const size = cur ? 60 + cur.pumps * 7 : 0;

  return (
    <div className="flex flex-col gap-4">
      {p.isParticipant && mine && !mine.done && cur && (
        <div className="flex flex-col items-center gap-3">
          <p className="font-display text-xl">
            Balloon {mine.current + 1}/{BALLOONS} · banked <span className="text-accent">{mine.total}</span>
          </p>
          {p.priv?.hint && (
            <p className="rounded-full bg-accent px-3 py-1 font-display text-sm text-[#241a00]">
              Bonus hint: pops between {p.priv.hint.lo} and {p.priv.hint.hi}
            </p>
          )}
          <div className="flex h-72 items-end justify-center">
            <motion.div
              animate={{ width: size, height: size * 1.15 }}
              transition={{ type: "spring", stiffness: 400, damping: 15 }}
              className="flex items-center justify-center rounded-[50%] font-display text-3xl text-white shadow-[inset_-12px_-12px_0_#0003]"
              style={{ background: COLORS[mine.current % 3] }}
            >
              {cur.pumps}
            </motion.div>
          </div>
          <div className="grid w-full grid-cols-[2fr_1fr] gap-3">
            <button
              data-testid="pump"
              className="btn-primary min-h-20 touch-none text-3xl"
              onPointerDown={() => {
                p.input({ action: "pump" });
                p.ui.play("pop", { volume: 0.25, rate: 1.6 + cur.pumps * 0.03 });
                p.ui.vibrate(15);
              }}
            >
              Pump!
            </button>
            <button className="btn-secondary min-h-20 text-2xl" disabled={cur.pumps === 0} onClick={() => p.input({ action: "stop" })}>
              Stop
            </button>
          </div>
        </div>
      )}
      {p.isParticipant && mine?.done && (
        <p className="rounded-3xl bg-bg-2 p-4 text-center font-display text-2xl">
          Total: <span className="text-accent">{mine.total}</span> · waiting for the others…
        </p>
      )}
      <ul className="grid grid-cols-2 gap-2">
        {others.map((pid) => {
          const r = p.pub.runs[pid];
          return (
            <li key={pid} className="flex items-center gap-2 rounded-2xl bg-bg-2 p-2">
              <p.ui.Avatar player={p.players[pid]} size={32} />
              <span className="flex gap-1">
                {r?.balloons.map((b, i) => (
                  <span
                    key={i}
                    className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white"
                    style={{ background: b.popped ? "#555" : COLORS[i], opacity: i > (r.current ?? 0) ? 0.3 : 1 }}
                  >
                    {b.popped ? "💥" : b.banked ? b.pumps : i === r.current ? "…" : ""}
                  </span>
                ))}
              </span>
              <span className="ml-auto font-display text-accent">{r?.total}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
