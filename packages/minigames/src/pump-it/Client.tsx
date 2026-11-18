"use client";
import { useRef } from "react";
import { motion } from "framer-motion";
import type { MinigameClientProps } from "../kit/types";
import { KeyHint, useKey } from "../kit/hooks";
import { Arena, ChunkyButton, Hud, Pill, PlayerChip, PopText } from "../kit/visual";
import { BALLOONS, type PumpPrivate, type PumpPublic } from "./logic";

const COLORS = ["#ff4d5e", "#3d8bff", "#2fd27a"];

export function PumpItClient(p: MinigameClientProps<PumpPublic, PumpPrivate>) {
  const keyAction = useRef<(() => void) | null>(null);
  keyAction.current = null;
  useKey(() => keyAction.current?.());
  const stopAction = useRef<(() => void) | null>(null);
  stopAction.current = null;
  useKey(() => stopAction.current?.(), { keys: ["Enter", "NumpadEnter"] });
  const mine = p.me ? p.pub.runs[p.me] : undefined;
  const others = p.participants.filter((x) => x !== p.me || !p.isParticipant);
  const cur = mine && mine.current < BALLOONS ? mine.balloons[mine.current] : null;
  const size = cur ? 60 + cur.pumps * 7 : 0;
  if (p.isParticipant && mine && !mine.done && cur) {
    keyAction.current = () => {
      p.input({ action: "pump" });
      p.ui.play("pop", { volume: 0.25, rate: 1.6 + cur.pumps * 0.03 });
    };
    if (cur.pumps > 0) stopAction.current = () => p.input({ action: "stop" });
  }

  const prevBalloon = mine && mine.current > 0 ? mine.balloons[mine.current - 1] : null;
  const wobble = cur ? Math.min(6, cur.pumps * 0.25) : 0;
  const color = mine ? COLORS[mine.current % 3] : COLORS[0];

  return (
    <div className="flex flex-col gap-4">
      {p.isParticipant && mine && !mine.done && cur && (
        <div className="flex flex-col items-center gap-3">
          <Hud
            left={
              <span className="flex gap-1.5">
                {mine.balloons.map((b, i) => (
                  <span
                    key={i}
                    className="h-4 w-3.5 rounded-[50%]"
                    style={{
                      background: b.popped ? "#555" : COLORS[i],
                      opacity: i === mine.current ? 1 : b.banked || b.popped ? 0.8 : 0.3,
                      boxShadow: i === mine.current ? `0 0 0 2px #fff` : undefined,
                    }}
                  />
                ))}
              </span>
            }
            right={<Pill tone="#ffc933">Banked {mine.total}</Pill>}
          />
          {p.priv?.hint && (
            <Pill tone="#ffc933">
              Bonus hint: pops between {p.priv.hint.lo} and {p.priv.hint.hi}
            </Pill>
          )}
          <Arena tone={color} className="relative flex h-80 w-full items-end justify-center pb-6" pattern="dots"
            bg={`radial-gradient(80% 60% at 50% 40%, ${color}33 0%, transparent 70%), linear-gradient(180deg, #1d1838, #120f24)`}>
            <span className="absolute left-1/2 top-1/3 -translate-x-1/2">
              <PopText id={prevBalloon ? `b${mine.current}` : null} text={prevBalloon?.popped ? "POP!" : `+${prevBalloon?.pumps ?? 0}`} color={prevBalloon?.popped ? "#ff4d5e" : "#2fd27a"} />
            </span>
            <motion.div
              key={mine.current}
              initial={{ y: 60, opacity: 0 }}
              animate={{ y: 0, opacity: 1, rotate: [-wobble, wobble, -wobble] }}
              transition={{ y: { type: "spring", stiffness: 200 }, rotate: { repeat: Infinity, duration: Math.max(0.12, 0.6 - cur.pumps * 0.02) } }}
              className="flex flex-col items-center"
              style={{ transformOrigin: "50% 100%" }}
            >
              <motion.div
                animate={{ width: size, height: size * 1.15 }}
                transition={{ type: "spring", stiffness: 400, damping: 15 }}
                className="relative flex items-center justify-center rounded-[50%] font-display text-3xl text-white"
                style={{
                  background: `radial-gradient(circle at 32% 28%, color-mix(in srgb, ${color} 100%, white 55%) 0%, ${color} 35%, color-mix(in srgb, ${color} 70%, black) 100%)`,
                  boxShadow: `0 0 ${10 + cur.pumps * 2}px ${color}88`,
                }}
              >
                <span className="absolute left-[22%] top-[16%] h-[18%] w-[12%] rotate-[-30deg] rounded-[50%] bg-white/50" />
                <span className="drop-shadow-[0_2px_0_#0006]">{cur.pumps}</span>
              </motion.div>
              {/* knot + string */}
              <span className="-mt-0.5 h-0 w-0 border-x-[7px] border-b-[10px] border-x-transparent" style={{ borderBottomColor: color }} />
              <svg width="20" height="56" viewBox="0 0 20 56" aria-hidden>
                <path d="M10 0 C 2 12, 18 22, 10 32 S 4 48, 10 56" stroke="#ffffff88" strokeWidth="2" fill="none" />
              </svg>
            </motion.div>
          </Arena>
          <div className="grid w-full grid-cols-[2fr_1fr] gap-3">
            <ChunkyButton
              testId="pump"
              color="#ffc933"
              className="min-h-20 touch-none text-3xl"
              onPointerDown={() => {
                p.input({ action: "pump" });
                p.ui.play("pop", { volume: 0.25, rate: 1.6 + cur.pumps * 0.03 });
                p.ui.vibrate(15);
              }}
            >
              Pump!
            </ChunkyButton>
            <ChunkyButton color="#2fd27a" textColor="#06210f" className="min-h-20 text-2xl" disabled={cur.pumps === 0} onClick={() => p.input({ action: "stop" })}>
              Bank
            </ChunkyButton>
          </div>
          <KeyHint label="Space = pump · Enter = bank" text="" />
        </div>
      )}
      {p.isParticipant && mine?.done && (
        <Arena tone="#ffc933" className="p-5 text-center">
          <p className="font-display text-2xl">
            Total: <span className="text-4xl text-accent">{mine.total}</span>
          </p>
          <p className="text-muted">Waiting for the others…</p>
        </Arena>
      )}
      <ul className="grid grid-cols-2 gap-2">
        {others.map((pid) => {
          const r = p.pub.runs[pid];
          return (
            <PlayerChip
              key={pid}
              avatar={<p.ui.Avatar player={p.players[pid]} size={32} />}
              name={undefined}
              value={
                <span className="flex items-center gap-2">
                  <span className="flex gap-1">
                    {r?.balloons.map((b, i) => (
                      <span
                        key={i}
                        className="flex h-7 w-6 items-center justify-center rounded-[50%] text-xs font-bold text-white"
                        style={{ background: b.popped ? "#444" : COLORS[i], opacity: i > (r.current ?? 0) ? 0.3 : 1 }}
                      >
                        {b.popped ? "✕" : b.banked ? b.pumps : i === r.current ? "…" : ""}
                      </span>
                    ))}
                  </span>
                  <span className="text-accent">{r?.total}</span>
                </span>
              }
            />
          );
        })}
      </ul>
    </div>
  );
}
