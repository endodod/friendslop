"use client";
import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SoloPrivate, SoloPublic } from "@party-game/shared";
import type { MinigameClientProps } from "../kit/types";
import { KeyHint, useKey } from "../kit/hooks";
import { SoloDone, useDeadlineSubmit } from "../kit/SoloShell";
import { Arena, Hud, Pill } from "../kit/visual";
import { MAX_LEN, PADS, sequence } from "./logic";

/** Quadrant corner rounding: top-left, top-right, bottom-left, bottom-right. */
const CORNERS = ["100% 18px 18px 18px", "18px 100% 18px 18px", "18px 18px 18px 100%", "18px 18px 100% 18px"];
/** Where each pad's key number sits (its outer corner). */
const LABEL_POS = [
  { top: "30%", left: "30%" },
  { top: "30%", right: "30%" },
  { bottom: "30%", left: "30%" },
  { bottom: "30%", right: "30%" },
];
const KEYS: Record<string, number> = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, KeyQ: 0, KeyW: 1, KeyA: 2, KeyS: 3, Numpad1: 0, Numpad2: 1, Numpad3: 2, Numpad4: 3 };

type Phase = "watch" | "input" | "wrong" | "levelUp";

export function SimonClient(p: MinigameClientProps<SoloPublic, SoloPrivate>) {
  const seq = useMemo(() => sequence(p.seed ?? 1), [p.seed]);
  const [level, setLevel] = useState(1);
  const [step, setStep] = useState(0);
  const [phase, setPhase] = useState<Phase>("watch");
  const [lit, setLit] = useState<number | null>(null);
  const [done, setDone] = useState(false);
  const [replays, setReplays] = useState(p.bonus ? 1 : 0);
  const [best, setBest] = useState(0);
  // Refs hold the truth for input handling, so fast taps never read stale state.
  const inputsRef = useRef<number[]>([]);
  const levelRef = useRef(1);
  const stepRef = useRef(0);
  const phaseRef = useRef<Phase>("watch");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useDeadlineSubmit(p, () => ({ inputs: inputsRef.current }), done, setDone);

  const later = (fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms));
  };
  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  useEffect(() => clearTimers, []);

  const setPhaseBoth = (ph: Phase) => {
    phaseRef.current = ph;
    setPhase(ph);
  };

  const show = useCallback(
    (len: number) => {
      clearTimers();
      setPhaseBoth("watch");
      setLit(null);
      const on = Math.max(260, 560 - len * 14);
      const gap = Math.max(120, 200 - len * 4);
      let t = 650;
      for (let i = 0; i < len; i++) {
        const pad = seq[i];
        later(() => {
          setLit(pad);
          p.ui.play("click", { rate: PADS[pad].note });
        }, t);
        later(() => setLit(null), t + on);
        t += on + gap;
      }
      later(() => {
        stepRef.current = 0;
        setStep(0);
        setPhaseBoth("input");
      }, t);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [seq],
  );

  useEffect(() => {
    show(1);
  }, [show]);

  const press = (pad: number) => {
    if (phaseRef.current !== "input" || done) return;
    const all = [...inputsRef.current, pad];
    inputsRef.current = all;
    setLit(pad);
    later(() => setLit((l) => (l === pad ? null : l)), 170);
    p.ui.play("click", { rate: PADS[pad].note });
    p.ui.vibrate(12);
    const lvl = levelRef.current;
    const st = stepRef.current;
    if (pad !== seq[st]) {
      p.ui.play("miss");
      p.ui.vibrate([80, 40, 80]);
      setPhaseBoth("wrong");
      p.submit({ inputs: all });
      later(() => setDone(true), 1100);
      return;
    }
    if (st + 1 < lvl) {
      stepRef.current = st + 1;
      setStep(st + 1);
      return;
    }
    // Level complete
    setBest(lvl);
    if (lvl >= seq.length) {
      setPhaseBoth("levelUp");
      setDone(true);
      p.submit({ inputs: all });
      return;
    }
    p.ui.play("coin", { volume: 0.3 });
    setPhaseBoth("levelUp");
    levelRef.current = lvl + 1;
    setLevel(lvl + 1);
    stepRef.current = 0;
    setStep(0);
    later(() => show(lvl + 1), 450);
  };

  useKey((e) => press(KEYS[e.code]), { keys: Object.keys(KEYS) });

  if (!p.isParticipant || p.priv?.submitted || done) return <SoloDone p={p} />;

  const wrong = phase === "wrong";
  const hub =
    phase === "watch" ? "Watch" : phase === "input" ? "Go!" : phase === "wrong" ? "Oops!" : "Nice!";
  return (
    <div className="flex flex-col items-center gap-3">
      <Hud
        left={<Pill tone="#ffc933">Length {level}</Pill>}
        right={<Pill tone="#2fd27a">Best {best}</Pill>}
      />
      <Arena tone={wrong ? "#ff4d5e" : "#3d8bff"} className="flex w-full flex-col items-center gap-4 px-4 py-6" pattern="dots">
        <motion.div
          animate={wrong ? { x: [0, -10, 9, -6, 4, 0] } : { x: 0 }}
          transition={{ duration: 0.45 }}
          className="relative aspect-square w-full max-w-[min(100%,46dvh)] rounded-full p-3"
          style={{ background: "radial-gradient(circle, #241f45 0%, #0d0b1a 100%)", boxShadow: "0 0 0 6px #2a2549, 0 18px 40px #000a, inset 0 0 30px #000" }}
        >
          <div className="grid h-full w-full grid-cols-2 gap-3">
            {PADS.map((pad, i) => {
              const on = lit === i;
              return (
                <button
                  key={i}
                  type="button"
                  aria-label={`pad ${i + 1}`}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    press(i);
                  }}
                  disabled={phase !== "input"}
                  className="relative touch-none select-none transition-[filter,transform,box-shadow] duration-100 disabled:cursor-default"
                  style={{
                    borderRadius: CORNERS[i],
                    background: on
                      ? `radial-gradient(circle at 50% 50%, #fff 0%, ${pad.color} 45%, ${pad.color} 100%)`
                      : `linear-gradient(145deg, ${pad.color}, color-mix(in srgb, ${pad.color} 55%, black))`,
                    filter: on ? "brightness(1.15) saturate(1.2)" : phase === "input" ? "brightness(0.8)" : "brightness(0.5) saturate(0.7)",
                    transform: on ? "scale(0.97)" : undefined,
                    boxShadow: on ? `0 0 40px 6px ${pad.color}, inset 0 0 20px #fff8` : "inset 0 -8px 0 #0005, inset 0 4px 0 #ffffff33",
                  }}
                >
                  <span className="absolute hidden font-display text-lg text-black/35 [@media(pointer:fine)]:inline" style={LABEL_POS[i]}>
                    {i + 1}
                  </span>
                </button>
              );
            })}
          </div>
          {/* Centre hub */}
          <div
            className="pointer-events-none absolute left-1/2 top-1/2 flex aspect-square w-[34%] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full"
            style={{ background: "radial-gradient(circle at 40% 30%, #3a3462, #14112a)", boxShadow: "0 0 0 6px #0d0b1a, 0 6px 20px #000c" }}
          >
            <span className={`font-display text-xl leading-none sm:text-2xl ${wrong ? "text-bad" : phase === "input" ? "text-good" : "text-accent"}`}>{hub}</span>
            <span className="mt-1 font-display text-3xl leading-none tabular-nums sm:text-4xl">{level}</span>
          </div>
        </motion.div>
        {/* step pips */}
        <div className="flex min-h-3 max-w-full flex-wrap justify-center gap-1" aria-label={`${step} of ${level} pressed`}>
          {Array.from({ length: Math.min(level, MAX_LEN) }, (_, i) => (
            <span
              key={i}
              className="h-2.5 w-2.5 rounded-full transition-colors"
              style={{ background: phase === "input" && i < step ? "#2fd27a" : phase === "watch" ? "#ffffff30" : "#ffffff18" }}
            />
          ))}
        </div>
      </Arena>
      {replays > 0 && phase === "input" && step === 0 && (
        <button
          className="btn-secondary"
          onClick={() => {
            setReplays(0);
            show(levelRef.current);
          }}
        >
          Replay sequence (bonus)
        </button>
      )}
      <KeyHint label="1 2 3 4" text="or press" />
    </div>
  );
}
