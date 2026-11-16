"use client";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { onGameEvent } from "@/lib/store";
import { play, vibrate } from "@/lib/sfx";

const CONFETTI_COLORS = ["#ffc933", "#ff4d5e", "#3d8bff", "#2fd27a", "#b26bff", "#ff6bc6"];

/** One-shot confetti burst. Re-trigger by changing `fireKey`. */
export function Confetti({ fireKey, count = 40 }: { fireKey: string | number | null; count?: number }) {
  const reduced = useReducedMotion();
  const [pieces, setPieces] = useState<{ id: number; x: number; r: number; c: string; d: number; s: number }[]>([]);
  useEffect(() => {
    if (fireKey === null || reduced) return;
    const base = Date.now();
    setPieces(
      Array.from({ length: count }, (_, i) => ({
        id: base + i,
        x: (Math.random() - 0.5) * 700,
        r: Math.random() * 720 - 360,
        c: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        d: 0.9 + Math.random() * 0.9,
        s: 6 + Math.random() * 8,
      })),
    );
    const t = setTimeout(() => setPieces([]), 2200);
    return () => clearTimeout(t);
  }, [fireKey, count, reduced]);
  return (
    <div className="pointer-events-none fixed inset-0 z-[80] overflow-hidden" aria-hidden>
      {pieces.map((p) => (
        <motion.span
          key={p.id}
          className="absolute left-1/2 top-1/3 block rounded-sm"
          style={{ width: p.s, height: p.s * 1.6, background: p.c }}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
          animate={{ x: p.x, y: [0, -220 - Math.random() * 120, 700], rotate: p.r, opacity: [1, 1, 0] }}
          transition={{ duration: p.d * 1.6, ease: "easeOut" }}
        />
      ))}
    </div>
  );
}

/** Shakes the referenced element on bad events (red tile, steal, losing coins to events). */
export function useScreenShake(myId: string | null) {
  const ref = useRef<HTMLElement | null>(null);
  useEffect(
    () =>
      onGameEvent((e) => {
        const bad =
          (e.type === "coinsChanged" && e.delta < 0 && (e.reason.startsWith("tile:") || e.reason === "steal" || e.reason === "event")) ||
          (e.type === "sfx" && e.id === "steal");
        if (!bad) return;
        const el = ref.current;
        if (el) {
          el.classList.remove("shake");
          void el.offsetWidth; // restart the CSS animation
          el.classList.add("shake");
        }
        if (!myId || (e.type === "coinsChanged" && e.playerId === myId)) vibrate([40, 30, 40]);
      }),
    [myId],
  );
  return ref;
}

/** Floating +N / −N coin deltas next to a player chip. */
export function CoinDelta({ playerId }: { playerId: string }) {
  const [items, setItems] = useState<{ id: number; delta: number }[]>([]);
  useEffect(
    () =>
      onGameEvent((e) => {
        if (e.type === "coinsChanged" && e.playerId === playerId) {
          const id = Date.now() + Math.random();
          setItems((x) => [...x, { id, delta: e.delta }]);
          if (e.delta > 0) play("coin", { volume: 0.35, rate: 1 + Math.min(e.delta, 10) * 0.02 });
          setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 1600);
        }
      }),
    [playerId],
  );
  return (
    <span className="pointer-events-none absolute -top-2 right-1 z-10" aria-live="polite">
      <AnimatePresence>
        {items.map((i) => (
          <motion.span
            key={i.id}
            initial={{ y: 10, opacity: 0, scale: 0.6 }}
            animate={{ y: -26, opacity: 1, scale: 1.2 }}
            exit={{ y: -46, opacity: 0 }}
            transition={{ duration: 0.6 }}
            className={`absolute right-0 whitespace-nowrap font-display text-xl drop-shadow-[0_2px_0_#000] ${
              i.delta > 0 ? "text-accent" : "text-bad"
            }`}
          >
            {i.delta > 0 ? `+${i.delta}` : i.delta}
          </motion.span>
        ))}
      </AnimatePresence>
    </span>
  );
}
