"use client";
import { motion } from "framer-motion";
import { useEffect, useRef } from "react";
import { colorHex } from "@party-game/shared";
import type { MinigameClientProps } from "../kit/types";
import { HoldButton } from "../kit/hooks";
import { FINISH, type RedLightPublic } from "./logic";

const LIGHT_COLORS = { green: "#2fd27a", yellow: "#ffc933", red: "#ff4d5e" };

export function RedLightClient(p: MinigameClientProps<RedLightPublic, { bonus: boolean; warning: boolean }>) {
  const { light, pos, finished, caught } = p.pub;
  const lastLight = useRef(light);
  const lastCaught = useRef(0);
  useEffect(() => {
    if (light !== lastLight.current) {
      if (light === "red") p.ui.play("bad", { volume: 0.4 });
      if (light === "green") p.ui.play("go", { volume: 0.3 });
      lastLight.current = light;
    }
  }, [light, p.ui]);
  const myCaught = p.me ? (caught[p.me] ?? 0) : 0;
  useEffect(() => {
    if (myCaught > lastCaught.current) {
      p.ui.vibrate([100, 50, 100]);
      p.ui.play("miss");
    }
    lastCaught.current = myCaught;
  }, [myCaught, p.ui]);

  const warn = p.priv?.warning;
  const lc = LIGHT_COLORS[light as keyof typeof LIGHT_COLORS] ?? "#2a2549";
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-center">
        {/* traffic light housing */}
        <div
          className="flex items-center gap-3 rounded-[28px] px-4 py-3"
          style={{ background: "linear-gradient(180deg, #2b2a36, #15141c)", boxShadow: `0 0 0 3px #0d0b1a, 0 10px 24px #000a, 0 0 60px ${lc}44` }}
        >
          {(["red", "yellow", "green"] as const).map((c) => {
            const on = light === c;
            return (
              <span
                key={c}
                className="relative flex h-16 w-16 items-center justify-center rounded-full font-display text-xs text-[#14112a] transition-all duration-100"
                style={{
                  background: on
                    ? `radial-gradient(circle at 40% 35%, #fff 0%, ${LIGHT_COLORS[c]} 35%, color-mix(in srgb, ${LIGHT_COLORS[c]} 60%, black) 100%)`
                    : `radial-gradient(circle at 40% 35%, color-mix(in srgb, ${LIGHT_COLORS[c]} 30%, #222) 0%, #121118 100%)`,
                  boxShadow: on ? `0 0 34px 6px ${LIGHT_COLORS[c]}, inset 0 -4px 0 #0004` : "inset 0 4px 10px #000",
                }}
                aria-label={on ? `${c} light` : undefined}
              >
                {on ? c.toUpperCase() : ""}
              </span>
            );
          })}
        </div>
      </div>
      {warn && (
        <motion.p animate={{ scale: [1, 1.08, 1] }} transition={{ repeat: Infinity, duration: 0.5 }} className="text-center font-display text-2xl text-bad">
          ⚠ RED INCOMING
        </motion.p>
      )}
      <ul
        className="flex flex-col overflow-hidden rounded-[24px] py-1"
        style={{ background: "linear-gradient(180deg, #2a2838, #1d1c27)", boxShadow: `inset 0 0 0 2px ${lc}55, 0 10px 24px #0007` }}
      >
        {p.participants.map((pid, i) => {
          const pl = p.players[pid];
          const fin = finished.includes(pid);
          return (
            <li key={pid} className={`relative h-14 ${i > 0 ? "border-t-2 border-dashed border-white/15" : ""}`}>
              {/* finish line */}
              <span
                className="absolute inset-y-0 right-0 w-5 opacity-80"
                style={{ background: "repeating-conic-gradient(#fff 0 25%, #111 0 50%) 0 0 / 10px 10px" }}
              />
              <span
                className="absolute top-1.5 transition-[left] duration-100 ease-linear"
                /* 0 → left edge; FINISH → the avatar touches the middle of the finish strip, at any track width */
                style={{ left: `calc(${Math.min(1, (pos[pid] ?? 0) / FINISH)} * (100% - 54px) + 4px)` }}
              >
                <motion.span
                  className="block"
                  animate={fin ? { y: [0, -6, 0] } : (p.pub.holding?.[pid] && light !== "red") ? { y: [0, -3, 0] } : { y: 0 }}
                  transition={{ repeat: Infinity, duration: fin ? 0.6 : 0.25 }}
                >
                  <p.ui.Avatar player={pl} size={40} ring={fin} />
                </motion.span>
              </span>
              <span className="sr-only">{pl?.name} at {Math.round(pos[pid] ?? 0)}%</span>
              {(caught[pid] ?? 0) > 0 && (
                <span className="absolute right-7 top-1 rounded-full px-2 text-xs font-bold text-[#14112a]" style={{ background: colorHex(pl?.color ?? "") }}>
                  caught ×{caught[pid]}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {p.isParticipant && (
        <HoldButton
          label="Hold to run"
          holdingLabel={light === "red" ? "LET GO!" : "Running…"}
          color={light === "red" ? "#ff4d5e" : "#2fd27a"}
          disabled={!!p.me && finished.includes(p.me)}
          onChange={(hold) => p.input({ hold })}
        />
      )}
    </div>
  );
}
