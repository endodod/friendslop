"use client";
import { gameNow, useGamePaused } from "../kit/clock";
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import type { MinigameClientProps } from "../kit/types";
import { KeyHint, SoloStatus, SubmittedNotice, useKey } from "../kit/hooks";
import type { SoloPrivate, SoloPublic } from "@party-game/shared";
import { Hud, Pill, RoundDots } from "../kit/visual";
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
  // A pause cancels the round in progress (no penalty); tap again to restart it.
  useGamePaused((paused) => {
    if (!paused) return;
    if (timer.current) clearTimeout(timer.current);
    setStage((st) => {
      if (st !== "waiting" && st !== "green") return st;
      setMsg("Paused, tap to retry this round");
      return "ready";
    });
  });

  const startRound = () => {
    setStage("waiting");
    setMsg("");
    timer.current = setTimeout(() => {
      greenAt.current = gameNow();
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
    if (stage === "green") record(gameNow() - greenAt.current);
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
  const theme =
    stage === "green"
      ? { bg: "radial-gradient(circle at 50% 45%, #7dffb3 0%, #2fd27a 40%, #0f8a49 100%)", tone: "#2fd27a", ink: "#06210f" }
      : stage === "waiting"
        ? { bg: "radial-gradient(circle at 50% 45%, #ff7b88 0%, #ff4d5e 40%, #8f1323 100%)", tone: "#ff4d5e", ink: "#fff" }
        : { bg: "radial-gradient(circle at 50% 35%, #4a3f8a 0%, #2a2549 50%, #15122b 100%)", tone: "#7b5cff", ink: "#fff" };
  const last = times[times.length - 1];
  return (
    <div className="flex flex-col gap-3">
      <Hud
        left={<RoundDots total={ROUNDS} done={Math.min(times.length, ROUNDS)} />}
        right={
          <>
            {times.map((t, i) => (
              <Pill key={i} tone={t === Math.min(...times) ? "#2fd27a" : undefined}>
                {Math.round(t)}
              </Pill>
            ))}
          </>
        }
      />
      <button
        onPointerDown={tap}
        className="relative flex min-h-[55dvh] w-full touch-none select-none flex-col items-center justify-center gap-3 overflow-hidden rounded-[28px] text-center font-display"
        style={{ background: theme.bg, color: theme.ink, boxShadow: `inset 0 0 0 3px ${theme.tone}aa, 0 0 50px ${theme.tone}55, 0 12px 30px #0008` }}
        data-testid="reaction-pad"
      >
        {stage === "waiting" &&
          [0, 1, 2].map((i) => (
            <motion.span
              key={i}
              aria-hidden
              className="pointer-events-none absolute left-1/2 top-1/2 aspect-square w-[40%] -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-white/40"
              initial={{ scale: 0.4, opacity: 0.8 }}
              animate={{ scale: 2.6, opacity: 0 }}
              transition={{ repeat: Infinity, duration: 2.1, delay: i * 0.7, ease: "easeOut" }}
            />
          ))}
        {stage === "green" && (
          <motion.span
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{ background: "repeating-conic-gradient(from 0deg, #ffffff33 0 10deg, transparent 10deg 20deg)" }}
            initial={{ scale: 0.5, opacity: 0, rotate: 0 }}
            animate={{ scale: 1.6, opacity: 1, rotate: 30 }}
            transition={{ duration: 0.4 }}
          />
        )}
        <span className="relative text-xl opacity-80">
          Round {Math.min(round + 1, ROUNDS)}/{ROUNDS}
        </span>
        <motion.span
          key={stage}
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 400, damping: 18 }}
          className="relative px-4 text-5xl leading-tight drop-shadow-[0_3px_0_#0005] sm:text-6xl"
        >
          {stage === "ready" ? "Tap to start" : stage === "waiting" ? "Wait for green…" : stage === "green" ? "TAP!" : "Tap for next"}
        </motion.span>
        {msg && (
          <motion.span
            key={msg + times.length}
            initial={{ y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className={`relative rounded-2xl px-4 py-1 text-3xl ${msg.endsWith(" ms") ? "bg-black/25" : "bg-black/40 text-white"}`}
          >
            {msg}
            {msg.endsWith(" ms") && last !== undefined && <span className="ml-2 text-lg opacity-80">{rating(last)}</span>}
          </motion.span>
        )}
        {p.bonus && <span className="relative rounded-full bg-black/30 px-3 py-1 text-sm text-white">Bonus: one false start forgiven</span>}
        <span className="relative">
          <KeyHint text="or tap / press" />
        </span>
      </button>
    </div>
  );
}

function rating(ms: number) {
  return ms < 200 ? "Lightning!" : ms < 260 ? "Sharp!" : ms < 350 ? "Nice" : "Sleepy…";
}
