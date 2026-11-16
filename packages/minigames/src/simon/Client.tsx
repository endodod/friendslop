"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SoloPrivate, SoloPublic } from "@party-game/shared";
import type { MinigameClientProps } from "../kit/types";
import { SoloDone, useDeadlineSubmit } from "../kit/SoloShell";
import { PADS, sequence } from "./logic";

export function SimonClient(p: MinigameClientProps<SoloPublic, SoloPrivate>) {
  const seq = useMemo(() => sequence(p.seed ?? 1), [p.seed]);
  const [level, setLevel] = useState(1);
  const [inputs, setInputs] = useState<number[]>([]);
  const [step, setStep] = useState(0);
  const [showing, setShowing] = useState(true);
  const [lit, setLit] = useState<number | null>(null);
  const [done, setDone] = useState(false);
  const [replays, setReplays] = useState(p.bonus ? 1 : 0);
  const inputsRef = useRef<number[]>([]);
  useDeadlineSubmit(p, () => ({ inputs: inputsRef.current }), done, setDone);

  const show = (len: number) => {
    setShowing(true);
    let i = 0;
    const next = () => {
      if (i >= len) {
        setLit(null);
        setShowing(false);
        return;
      }
      const pad = seq[i++];
      setLit(pad);
      p.ui.play("click", { rate: PADS[pad].note });
      setTimeout(() => {
        setLit(null);
        setTimeout(next, 180);
      }, Math.max(250, 520 - len * 12));
    };
    setTimeout(next, 500);
  };
  useEffect(() => show(level), [level]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!p.isParticipant || p.priv?.submitted || done) return <SoloDone p={p} />;
  const press = (pad: number) => {
    if (showing) return;
    const all = [...inputsRef.current, pad];
    inputsRef.current = all;
    setInputs(all);
    setLit(pad);
    setTimeout(() => setLit(null), 150);
    p.ui.play("click", { rate: PADS[pad].note });
    if (pad !== seq[step]) {
      p.ui.play("miss");
      setDone(true);
      p.submit({ inputs: all });
      return;
    }
    if (step + 1 === level) {
      setStep(0);
      if (level >= seq.length) {
        setDone(true);
        p.submit({ inputs: all });
      } else setLevel(level + 1);
    } else setStep(step + 1);
  };
  return (
    <div className="flex flex-col items-center gap-4">
      <p className="font-display text-xl">{showing ? "Watch…" : `Your turn · length ${level}`}</p>
      <div className="grid w-full max-w-xs grid-cols-2 gap-3">
        {PADS.map((pad, i) => (
          <button
            key={i}
            aria-label={`pad ${i + 1}`}
            onPointerDown={() => press(i)}
            className="aspect-square touch-none rounded-3xl transition-all"
            style={{ background: pad.color, opacity: lit === i ? 1 : 0.4, transform: lit === i ? "scale(1.05)" : undefined, boxShadow: lit === i ? `0 0 30px ${pad.color}` : undefined }}
          />
        ))}
      </div>
      {replays > 0 && !showing && step === 0 && (
        <button
          className="btn-secondary"
          onClick={() => {
            setReplays(0);
            show(level);
          }}
        >
          Replay sequence (bonus)
        </button>
      )}
      <span className="sr-only">{inputs.length} presses</span>
    </div>
  );
}
