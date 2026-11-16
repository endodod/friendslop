"use client";
import { useRef, useState } from "react";
import type { SoloPrivate, SoloPublic } from "@party-game/shared";
import type { MinigameClientProps } from "../kit/types";
import { SoloDone, useDeadlineSubmit } from "../kit/SoloShell";
import { phrase } from "./logic";

export function TypeRaceClient(p: MinigameClientProps<SoloPublic, SoloPrivate>) {
  const target = phrase(p.seed ?? 1, p.bonus);
  const [typed, setTyped] = useState("");
  const [done, setDone] = useState(false);
  const start = useRef<number | null>(null);
  const elapsed = () => (start.current === null ? 60000 : performance.now() - start.current);
  useDeadlineSubmit(p, () => ({ typed, timeMs: elapsed() }), done, setDone);
  if (!p.isParticipant || p.priv?.submitted || done) return <SoloDone p={p} />;
  const finish = () => {
    setDone(true);
    p.submit({ typed, timeMs: elapsed() });
  };
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        finish();
      }}
    >
      <p className="rounded-2xl bg-bg-2 p-4 font-mono text-xl leading-relaxed" aria-label="Phrase to type">
        {target.split("").map((ch, i) => (
          <span key={i} className={i < typed.length ? (typed[i] === ch ? "text-good" : "bg-bad/50 text-white") : "text-muted"}>
            {ch}
          </span>
        ))}
      </p>
      <input
        className="input font-mono"
        autoFocus
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        value={typed}
        aria-label="Type here"
        onChange={(e) => {
          if (start.current === null) start.current = performance.now();
          const v = e.target.value.toLowerCase();
          setTyped(v);
          if (v === target) {
            setDone(true);
            p.submit({ typed: v, timeMs: performance.now() - start.current });
          }
        }}
      />
      <button className="btn-primary" type="submit">Done</button>
      <p className="text-sm text-muted">Each mistake adds 1.5 s.</p>
    </form>
  );
}
