"use client";
import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useRef, useState } from "react";
import type { SoloPrivate, SoloPublic } from "@party-game/shared";
import type { MinigameClientProps } from "../kit/types";
import { KeyHint, useKey } from "../kit/hooks";
import { SoloDone, useDeadlineSubmit } from "../kit/SoloShell";
import { Arena, ChunkyButton, Hud, Pill } from "../kit/visual";
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
  const st = streak(cards, guesses, p.bonus);
  return (
    <div className="flex flex-col items-center gap-4">
      <Hud
        left={<Pill tone={st >= 3 ? "#ff8a3d" : "#ffc933"}>{st >= 3 ? "🔥" : "Streak"} {st}</Pill>}
        right={<Pill>{cards.length - 1 - idx} cards left</Pill>}
      />
      <Arena
        tone="#2fd27a"
        className="flex w-full items-center justify-center gap-6 py-8"
        bg="radial-gradient(70% 70% at 50% 50%, #1f7a4a 0%, #0f4a2c 70%, #0a2f1d 100%)"
        pattern="none"
      >
        <div className="relative h-52 w-36">
          <AnimatePresence mode="popLayout">
            <motion.div
              key={idx}
              initial={{ rotateY: 90, x: 80 }}
              animate={{ rotateY: 0, x: 0 }}
              exit={{ x: -120, rotate: -15, opacity: 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 22 }}
              className="absolute inset-0"
            >
              <PlayingCard value={cards[idx]} index={idx} />
            </motion.div>
          </AnimatePresence>
        </div>
        {/* deck */}
        <div className="relative h-36 w-24" aria-hidden>
          {[3, 2, 1, 0].map((k) => (
            <span
              key={k}
              className="absolute inset-0 rounded-xl border-2 border-white"
              style={{
                transform: `translate(${k * 3}px, ${-k * 3}px)`,
                background: "repeating-linear-gradient(45deg, #b0283a 0 6px, #d23a4d 6px 12px)",
                boxShadow: "0 4px 10px #0006",
              }}
            />
          ))}
        </div>
      </Arena>
      <div className="grid w-full grid-cols-2 gap-3">
        <ChunkyButton color="#2fd27a" textColor="#06210f" className="min-h-20 text-2xl" onClick={() => guess("h")}>▲ Higher</ChunkyButton>
        <ChunkyButton color="#ff4d5e" textColor="#fff" className="min-h-20 text-2xl" onClick={() => guess("l")}>▼ Lower</ChunkyButton>
      </div>
      {skipsLeft > 0 && (
        <button className="btn-secondary" onClick={() => guess("s")}>Skip (bonus)</button>
      )}
      <p className="text-sm text-muted">Same value counts as correct.</p>
      <KeyHint label="↑ higher · ↓ lower" text="" />
    </div>
  );
}

const SUITS = ["♠", "♥", "♦", "♣"];

function PlayingCard({ value, index }: { value: number; index: number }) {
  const suit = SUITS[(index * 7 + value) % 4];
  const red = suit === "♥" || suit === "♦";
  const label = CARD_LABEL[value];
  const color = red ? "#d0213a" : "#14112a";
  return (
    <div
      className="relative flex h-full w-full items-center justify-center rounded-2xl font-display"
      style={{ background: "linear-gradient(160deg, #ffffff, #ece8f8)", color, boxShadow: "0 10px 24px #000a, inset 0 0 0 2px #0000000f" }}
    >
      <span className="absolute left-2.5 top-1.5 flex flex-col items-center text-2xl leading-none">
        {label}
        <span className="text-lg">{suit}</span>
      </span>
      <span className="absolute bottom-1.5 right-2.5 flex rotate-180 flex-col items-center text-2xl leading-none">
        {label}
        <span className="text-lg">{suit}</span>
      </span>
      <span className="text-6xl">{label}</span>
      <span className="absolute text-[7rem] leading-none opacity-[0.08]">{suit}</span>
    </div>
  );
}
