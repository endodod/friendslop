"use client";
import { useRef, useState } from "react";
import type { SoloPrivate, SoloPublic } from "@party-game/shared";
import type { MinigameClientProps } from "../kit/types";
import { SoloDone, useDeadlineSubmit } from "../kit/SoloShell";
import { Arena, Hud, Pill } from "../kit/visual";
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
  let correct = 0;
  while (correct < typed.length && typed[correct] === target[correct]) correct++;
  const progress = correct / target.length;
  const errors = [...typed].filter((ch, i) => ch !== target[i]).length;
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        finish();
      }}
    >
      <Hud left={<Pill tone="#2fd27a">{Math.round(progress * 100)}%</Pill>} right={errors > 0 ? <Pill tone="#ff4d5e">{errors} typo{errors > 1 ? "s" : ""}</Pill> : <Pill>no typos</Pill>} />
      {/* race track */}
      <div className="relative h-12 overflow-hidden rounded-2xl" style={{ background: "linear-gradient(180deg, #2a2838, #1d1c27)", boxShadow: "inset 0 0 0 2px #ffffff14" }}>
        <span className="absolute inset-x-3 top-1/2 border-t-2 border-dashed border-white/20" />
        <span className="absolute inset-y-0 right-0 w-4" style={{ background: "repeating-conic-gradient(#fff 0 25%, #111 0 50%) 0 0 / 8px 8px" }} />
        <span className="absolute top-1/2 -translate-y-1/2 transition-[left] duration-150" style={{ left: `calc(${progress * 88}% + 4px)` }}>
          <p.ui.Avatar player={p.me ? p.players[p.me] : undefined} size={34} />
        </span>
      </div>
      <Arena tone="#2fd27a" className="p-4" pattern="none">
        <p className="font-mono text-xl leading-relaxed" aria-label="Phrase to type">
          {target.split("").map((ch, i) => (
            <span
              key={i}
              className={`${
                i < typed.length ? (typed[i] === ch ? "text-good" : "rounded bg-bad/60 text-white") : "text-muted/70"
              } ${i === typed.length ? "border-b-2 border-accent text-ink" : ""}`}
            >
              {ch}
            </span>
          ))}
        </p>
      </Arena>
      <input
        className="input font-mono"
        autoFocus
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        value={typed}
        aria-label="Type here"
        placeholder="Start typing…"
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
