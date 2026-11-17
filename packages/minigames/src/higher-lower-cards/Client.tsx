"use client";
import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useRef, useState } from "react";
import type { SoloPrivate, SoloPublic } from "@party-game/shared";
import type { MinigameClientProps } from "../kit/types";
import { KeyHint, useKey } from "../kit/hooks";
import { SoloDone, useDeadlineSubmit } from "../kit/SoloShell";
import { CARD_LABEL, deck, streak } from "./logic";

export function HigherLowerCardsClient(p: MinigameClientProps<SoloPublic, SoloPrivate>) {
  const keyAction = useRef<(() => void) | null>(null);
  keyAction.current = null;
  useKey(() => keyAction.current?.());
  const arrowAction = useRef<((g: "h" | "l") => void) | null>(null);
  arrowAction.current = null;
  useKey((e) => arrowAction.current?.(e.code === "ArrowUp" ? "h" : "l"), { keys: ["ArrowUp", "ArrowDown"] });
  const cards = useMemo(() => deck(p.seed ?? 1), [p.seed]);
  const [guesses, setGuesses] = useState<("h" | "l" | "s")[]>([]);
  const [done, setDone] = useState(false);
  useDeadlineSubmit(p, () => ({ guesses }), done, setDone);
  if (!p.isParticipant || p.priv?.submitted || done) return <SoloDone p={p} />;
  const idx = guesses.length;
  const skipsLeft = (p.bonus ? 1 : 0) - guesses.filter((g) => g === "s").length;
  const guess = (g: "h" | "l" | "s") => {
    const next = [...guesses, g];
    const s = streak(cards, next, p.bonus);
    const failed = g !== "s" && s < next.filter((x) => x !== "s").length;
    setGuesses(next);
    p.ui.play(failed ? "miss" : "click");
    if (failed || next.length >= cards.length - 1) {
      setDone(true);
      setTimeout(() => p.submit({ guesses: next }), 0);
    }
  };
  arrowAction.current = guess;
  return (
    <div className="flex flex-col items-center gap-5">
      <p className="font-display text-xl">Streak: {streak(cards, guesses, p.bonus)}</p>
      <AnimatePresence mode="popLayout">
        <motion.div
          key={idx}
          initial={{ rotateY: 90, x: 60 }}
          animate={{ rotateY: 0, x: 0 }}
          exit={{ x: -80, opacity: 0 }}
          className="flex h-48 w-32 items-center justify-center rounded-2xl bg-white font-display text-6xl text-[#14112a] shadow-xl"
        >
          {CARD_LABEL[cards[idx]]}
        </motion.div>
      </AnimatePresence>
      <div className="grid w-full grid-cols-2 gap-3">
        <button className="btn min-h-20 bg-good text-2xl text-[#06210f]" onClick={() => guess("h")}>▲ Higher</button>
        <button className="btn min-h-20 bg-bad text-2xl text-white" onClick={() => guess("l")}>▼ Lower</button>
      </div>
      {skipsLeft > 0 && (
        <button className="btn-secondary" onClick={() => guess("s")}>Skip (bonus)</button>
      )}
      <p className="text-sm text-muted">Same value counts as correct.</p>
      <KeyHint label="↑ higher · ↓ lower" text="" />
    </div>
  );
}
