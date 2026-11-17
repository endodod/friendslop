"use client";
import { useEffect, useRef, useState } from "react";
import type { MinigameClientProps } from "../kit/types";
import { KeyHint, SoloStatus, SubmittedNotice, useKey } from "../kit/hooks";
import type { SoloPrivate, SoloPublic } from "@party-game/shared";
import { FALSE_START_PENALTY_MS, MAX_REACTION_MS, ROUNDS, greenDelays } from "./logic";

type Stage = "ready" | "waiting" | "green" | "result" | "done";

export function ReactionTapClient(p: MinigameClientProps<SoloPublic, SoloPrivate>) {
  const keyAction = useRef<(() => void) | null>(null);
  keyAction.current = null;
  useKey(() => keyAction.current?.());
  const [round, setRound] = useState(0);
  const [stage, setStage] = useState<Stage>("ready");
  const [times, setTimes] = useState<number[]>([]);
  const [falseStarts, setFalseStarts] = useState(0);
  const [msg, setMsg] = useState("");
  const greenAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const delays = greenDelays(p.seed ?? 1);
  const forgiven = p.bonus && falseStarts === 0;

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const startRound = () => {
    setStage("waiting");
    setMsg("");
    timer.current = setTimeout(() => {
      greenAt.current = performance.now();
      setStage("green");
      p.ui.play("go", { volume: 0.4 });
      timer.current = setTimeout(() => record(MAX_REACTION_MS), MAX_REACTION_MS);
    }, delays[round] ?? 2000);
  };

  const record = (ms: number) => {
    if (timer.current) clearTimeout(timer.current);
    const next = [...times, ms];
    setTimes(next);
    setMsg(`${Math.round(ms)} ms`);
    if (next.length >= ROUNDS) {
      setStage("done");
      p.submit({ times: next, falseStarts });
    } else {
      setStage("result");
      setRound((r) => r + 1);
    }
  };

  const tap = () => {
    if (stage === "ready" || stage === "result") return startRound();
    if (stage === "waiting") {
      if (timer.current) clearTimeout(timer.current);
      p.ui.play("bad");
      p.ui.vibrate(80);
      setFalseStarts((f) => f + 1);
      setMsg(forgiven ? "False start! (forgiven — bonus)" : `False start! +${FALSE_START_PENALTY_MS} ms`);
      setStage("result");
      return;
    }
    if (stage === "green") record(performance.now() - greenAt.current);
  };

  if (!p.isParticipant || p.priv?.submitted || stage === "done") {
    return (
      <div className="flex flex-col gap-3">
        {p.isParticipant && <SubmittedNotice label={`Best: ${Math.round(Math.min(...(times.length ? times : [0])))} ms`} />}
        <SoloStatus participants={p.participants} submitted={p.pub.submitted} labels={p.pub.labels} players={p.players} Avatar={p.ui.Avatar} />
      </div>
    );
  }

  keyAction.current = tap;
  const bg = stage === "green" ? "#2fd27a" : stage === "waiting" ? "#ff4d5e" : "#2a2549";
  return (
    <button
      onPointerDown={tap}
      className="flex min-h-[55dvh] w-full touch-none select-none flex-col items-center justify-center gap-3 rounded-3xl text-center font-display text-white"
      style={{ background: bg }}
      data-testid="reaction-pad"
    >
      <span className="text-xl opacity-80">
        Round {Math.min(round + 1, ROUNDS)}/{ROUNDS}
      </span>
      <span className="text-5xl">
        {stage === "ready" ? "Tap to start" : stage === "waiting" ? "Wait for green…" : stage === "green" ? "TAP!" : "Tap for next"}
      </span>
      {msg && <span className="text-3xl">{msg}</span>}
      {p.bonus && <span className="rounded-full bg-black/30 px-3 py-1 text-sm">Bonus: one false start forgiven</span>}
      <KeyHint text="or tap / press" />
    </button>
  );
}
