"use client";
import { motion } from "framer-motion";
import { useEffect, useLayoutEffect, useRef, type MutableRefObject } from "react";
import { colorHex } from "@party-game/shared";
import type { MinigameClientProps } from "../kit/types";
import { HoldButton } from "../kit/hooks";
import { FINISH, SPEED, type RedLightPublic } from "./logic";

const LIGHT_COLORS = { green: "#2fd27a", yellow: "#ffc933", red: "#ff4d5e" };
/** Avatar width + its 4px inset on both sides: the travel is the track width minus this. */
const AVATAR_SPAN = 54;
/** Never extrapolate further than this past the last server update (lag spike, stalled tab). */
const MAX_EXTRAPOLATE_MS = 250;

/**
 * Runners are drawn every animation frame, not only when the server's 15 Hz state arrives.
 * From the last known position, a runner who is holding is predicted to keep going at SPEED.
 * A running avatar only ever moves forward: it runs a little faster or slower to catch up with
 * the prediction, so uneven network timing never shows as stutter. My own runner follows my
 * finger right away.
 */
function useSmoothRunners(pub: RedLightPublic, participants: string[], me: string | null, localHold: MutableRefObject<boolean>) {
  const els = useRef<Record<string, HTMLSpanElement | null>>({});
  const track = useRef<HTMLUListElement | null>(null);
  const shown = useRef<Record<string, number>>({});
  const snap = useRef({ pub, at: 0 });
  useLayoutEffect(() => {
    snap.current = { pub, at: performance.now() };
  }, [pub]);
  // Read by the frame loop, so it never has to restart when a new state (or array) arrives.
  const who = useRef({ participants, me });
  who.current = { participants, me };
  useEffect(() => {
    let id = 0;
    let last = performance.now();
    const frame = (t: number) => {
      const dt = Math.min(100, t - last);
      last = t;
      const { pub: s, at } = snap.current;
      const { participants, me } = who.current;
      const ahead = Math.min(MAX_EXTRAPOLATE_MS, t - at) / 1000;
      const travel = Math.max(0, (track.current?.clientWidth ?? 0) - AVATAR_SPAN);
      for (const pid of participants) {
        const el = els.current[pid];
        if (!el) continue;
        const base = s.pos[pid] ?? 0;
        const done = s.finished.includes(pid);
        const holding = pid === me ? localHold.current : !!s.holding?.[pid];
        const running = !done && holding && s.light !== "red";
        const target = done ? FINISH : Math.min(FINISH, base + (running ? SPEED * ahead : 0));
        const prev = shown.current[pid];
        const err = target - (prev ?? target);
        let next: number;
        // Big jumps (caught → back to start, first frame) snap.
        if (prev === undefined || Math.abs(err) > 12) next = target;
        else if (running) {
          // Error measured in "quarter seconds of running": ±1 of those changes the pace by ±70%.
          const pace = Math.max(0.3, Math.min(1.7, 1 + (0.7 * err) / (SPEED * 0.25)));
          next = Math.min(FINISH, prev + SPEED * pace * (dt / 1000));
        } else if (err < 0 && err > -1.5) next = prev; // stopped a hair ahead: just stay put
        else next = prev + err * (1 - Math.exp(-dt / 70));
        shown.current[pid] = next;
        el.style.transform = `translate3d(${(next / FINISH) * travel}px,0,0)`;
      }
      id = requestAnimationFrame(frame);
    };
    id = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(id);
  }, [localHold]);
  return { els, track };
}

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

  const localHold = useRef(false);
  const { els, track } = useSmoothRunners(p.pub, p.participants, p.isParticipant ? p.me : null, localHold);
  // Caught on red: the server let go for me.
  if (p.me && !p.pub.holding?.[p.me] && myCaught > lastCaught.current) localHold.current = false;

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
        ref={track}
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
              {/* 0 → left edge; FINISH → the avatar touches the middle of the finish strip. Moved every frame by useSmoothRunners. */}
              <span
                ref={(el) => {
                  els.current[pid] = el;
                }}
                className="absolute left-1 top-1.5 will-change-transform"
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
          onChange={(hold) => {
            localHold.current = hold;
            p.input({ hold });
          }}
        />
      )}
    </div>
  );
}
