"use client";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { onGameEvent } from "@/lib/store";
import { play, vibrate } from "@/lib/sfx";

const CONFETTI_COLORS = ["#ffc933", "#ff4d5e", "#3d8bff", "#2fd27a", "#b26bff", "#ff6bc6"];

/**
 * One-shot confetti burst. Re-trigger by changing `fireKey`.
 * Rendered into document.body: a transformed parent (screen shake, motion panels) would otherwise
 * turn `position: fixed` into "fixed to that parent" and clip the burst. All randomness is rolled
 * once per burst, so re-renders don't restart or jitter the pieces.
 */
export function Confetti({ fireKey, count = 40 }: { fireKey: string | number | null; count?: number }) {
  const reduced = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  const [burst, setBurst] = useState<{ key: number; pieces: Piece[] } | null>(null);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (fireKey === null || reduced) return;
    const w = typeof window === "undefined" ? 800 : window.innerWidth;
    const h = typeof window === "undefined" ? 800 : window.innerHeight;
    const pieces: Piece[] = Array.from({ length: count }, (_, i) => {
      // Two cannons from the lower corners, aiming up and inwards, plus a few from the top.
      const fromTop = i % 5 === 4;
      const left = i % 2 === 0;
      const x0 = fromTop ? Math.random() * w : left ? -10 : w + 10;
      const y0 = fromTop ? -20 : h * (0.7 + Math.random() * 0.2);
      const x1 = fromTop ? x0 + (Math.random() - 0.5) * 160 : left ? w * (0.15 + Math.random() * 0.55) : w * (0.3 + Math.random() * 0.55);
      const peak = fromTop ? y0 + 40 : h * (0.08 + Math.random() * 0.35);
      return {
        id: i,
        x0,
        y0,
        x1,
        peak,
        y2: h + 40,
        r: (Math.random() - 0.5) * 1080,
        flip: Math.random() > 0.5,
        c: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        dur: 1.8 + Math.random() * 1.2,
        delay: Math.random() * 0.25,
        size: 7 + Math.random() * 7,
        round: Math.random() < 0.25,
      };
    });
    setBurst({ key: Date.now(), pieces });
    const t = setTimeout(() => setBurst(null), 3600);
    return () => clearTimeout(t);
  }, [fireKey, count, reduced]);
  if (!mounted || !burst) return null;
  return createPortal(
    <div key={burst.key} className="pointer-events-none fixed inset-0 z-[80] overflow-hidden" aria-hidden>
      {burst.pieces.map((p) => (
        <motion.span
          key={p.id}
          className="absolute left-0 top-0 block"
          style={{ width: p.size, height: p.round ? p.size : p.size * 1.6, background: p.c, borderRadius: p.round ? "50%" : 2 }}
          initial={{ x: p.x0, y: p.y0, opacity: 1, rotate: 0, rotateX: 0 }}
          animate={{ x: [p.x0, p.x1, p.x1 + (p.flip ? 40 : -40)], y: [p.y0, p.peak, p.y2], rotate: p.r, rotateX: p.flip ? 720 : -540, opacity: [1, 1, 0.9] }}
          transition={{ duration: p.dur, delay: p.delay, times: [0, 0.3, 1], ease: ["easeOut", "easeIn"] }}
        />
      ))}
    </div>,
    document.body,
  );
}

interface Piece {
  id: number;
  x0: number;
  y0: number;
  x1: number;
  peak: number;
  y2: number;
  r: number;
  flip: boolean;
  c: string;
  dur: number;
  delay: number;
  size: number;
  round: boolean;
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
