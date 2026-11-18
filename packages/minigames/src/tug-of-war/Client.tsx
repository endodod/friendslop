"use client";
import { motion } from "framer-motion";
import { useRef } from "react";
import type { MinigameClientProps } from "../kit/types";
import { useFrameNow, useKey, KeyHint } from "../kit/hooks";
import { Arena, ChunkyButton, Hud, Pill, SecondsPill } from "../kit/visual";
import { LIMIT, PULL_MS, READY_MS, teamStrength } from "./logic";

interface Pub {
  teams: [string[], string[]];
  startedAt: number;
  rope: number;
  taps: Record<string, number>;
  winner: 0 | 1 | "tie" | null;
}
const TEAM_COLORS = ["#3d8bff", "#ff4d5e"] as const;
const TEAM_NAMES = ["Blue", "Red"] as const;

export function TugOfWarClient(p: MinigameClientProps<Pub, { team: 0 | 1; bonus: boolean }>) {
  const { pub } = p;
  const now = useFrameNow(p.now, pub.winner === null);
  const goAt = pub.startedAt + READY_MS;
  const ready = now < goAt;
  const left = goAt + PULL_MS - now;
  const myTeam = p.priv?.team ?? null;
  const last = useRef(0);
  const pull = () => {
    if (!p.isParticipant || ready || pub.winner !== null) return;
    p.input({ tap: true });
    if (now - last.current > 120) p.ui.play("hop", { volume: 0.3, rate: 0.9 + Math.random() * 0.3 });
    last.current = now;
  };
  useKey(pull);
  // Rope knot: -LIMIT (far left) .. +LIMIT (far right) mapped to 10%..90%.
  const knot = 50 + (pub.rope / LIMIT) * 40;
  return (
    <div className="flex flex-col gap-4">
      <Hud
        left={myTeam !== null ? <Pill tone={TEAM_COLORS[myTeam]}>You're team {TEAM_NAMES[myTeam]}</Pill> : undefined}
        right={pub.winner === null && !ready ? <SecondsPill ms={left} /> : p.priv?.bonus ? <Pill tone="#ffc933">Bonus: stronger pulls</Pill> : undefined}
      />
      <Arena tone={myTeam !== null ? TEAM_COLORS[myTeam] : "#7b5cff"} className="flex flex-col gap-4 p-4" bg="linear-gradient(180deg, #1f3a5c 0%, #183022 55%, #2a4d1e 100%)" pattern="none">
        <div className="grid grid-cols-2 gap-2">
          {([0, 1] as const).map((t) => (
            <div key={t} className={`flex flex-wrap items-center gap-1 ${t === 1 ? "justify-end" : ""}`}>
              {pub.teams[0].length !== pub.teams[1].length && (
                <span
                  className="rounded-full px-2 py-0.5 font-display text-xs"
                  style={{ background: `${TEAM_COLORS[t]}55` }}
                  title="Smaller teams pull harder so it stays fair"
                >
                  {pub.teams[t].length} {pub.teams[t].length === 1 ? "player" : "players"} · pull ×{teamStrength(pub.teams, t).toFixed(2).replace(/\.?0+$/, "")}
                </span>
              )}
              {pub.teams[t].map((pid) => (
                <span key={pid} className="flex items-center gap-1 rounded-full py-0.5 pl-0.5 pr-2 text-sm" style={{ background: `${TEAM_COLORS[t]}33` }}>
                  <p.ui.Avatar player={p.players[pid]} size={22} />
                  <span className="tabular-nums">{pub.taps[pid] ?? 0}</span>
                </span>
              ))}
            </div>
          ))}
        </div>
        <div className="relative h-24">
          {/* mud pit in the middle */}
          <span className="absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#5b3820] opacity-80 blur-[2px]" />
          <span className="absolute inset-y-0 left-[10%] w-1 rounded bg-[#3d8bff]" />
          <span className="absolute inset-y-0 right-[10%] w-1 rounded bg-[#ff4d5e]" />
          <motion.div className="absolute inset-y-0 w-full" animate={{ x: `${(pub.rope / LIMIT) * 40}%` }} transition={{ type: "spring", stiffness: 300, damping: 25 }}>
            <span className="absolute left-[-30%] right-[-30%] top-1/2 h-2.5 -translate-y-1/2 rounded-full" style={{ background: "repeating-linear-gradient(60deg, #d9b26b 0 6px, #a77b35 6px 12px)" }} />
            <span className="absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-white bg-accent shadow-[0_0_12px_#ffc933]" />
          </motion.div>
          <span className="sr-only">Rope at {Math.round(knot)}%</span>
        </div>
        {pub.teams[0].length !== pub.teams[1].length && ready && (
          <p className="text-center text-sm text-muted">Uneven teams: the smaller team pulls harder per tap.</p>
        )}
        <p className="text-center font-display text-2xl">
          {ready
            ? "Get ready…"
            : pub.winner === null
              ? "PULL!"
              : pub.winner === "tie"
                ? "Dead even!"
                : `Team ${TEAM_NAMES[pub.winner]} wins!`}
        </p>
      </Arena>
      {p.isParticipant && myTeam !== null && (
        <ChunkyButton color={TEAM_COLORS[myTeam]} textColor="#fff" className="min-h-32 text-4xl" onPointerDown={pull} disabled={ready || pub.winner !== null} testId="tug-pull">
          PULL!
          <span className="block text-sm opacity-80">
            tap as fast as you can <KeyHint />
          </span>
        </ChunkyButton>
      )}
    </div>
  );
}
