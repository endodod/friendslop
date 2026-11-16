"use client";
import { useEffect, useRef } from "react";
import { colorHex } from "@party-game/shared";
import type { MinigameClientProps } from "../kit/types";
import { HoldButton } from "../kit/hooks";
import type { RedLightPublic } from "./logic";

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
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-center gap-4">
        {(["red", "yellow", "green"] as const).map((c) => (
          <span
            key={c}
            className="flex h-16 w-16 items-center justify-center rounded-full font-display text-sm text-[#14112a] transition-all duration-100"
            style={{ background: light === c ? LIGHT_COLORS[c] : "#2a2549", boxShadow: light === c ? `0 0 30px ${LIGHT_COLORS[c]}` : undefined }}
            aria-label={light === c ? `${c} light` : undefined}
          >
            {light === c ? c.toUpperCase() : ""}
          </span>
        ))}
      </div>
      {warn && <p className="animate-pulse text-center font-display text-2xl text-bad">⚠ RED INCOMING</p>}
      <ul className="flex flex-col gap-2">
        {p.participants.map((pid) => {
          const pl = p.players[pid];
          return (
            <li key={pid} className="relative h-12 rounded-2xl bg-bg-2">
              <span className="absolute inset-y-0 right-3 flex items-center text-muted">🏁</span>
              <span
                className="absolute top-1 transition-[left] duration-100 ease-linear"
                style={{ left: `calc(${(pos[pid] ?? 0) * 0.88}% )` }}
              >
                <p.ui.Avatar player={pl} size={40} ring={finished.includes(pid)} />
              </span>
              <span className="sr-only">{pl?.name} at {Math.round(pos[pid] ?? 0)}%</span>
              {(caught[pid] ?? 0) > 0 && (
                <span className="absolute -top-1 right-10 rounded-full px-2 text-xs font-bold" style={{ background: colorHex(pl?.color ?? "") }}>
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
