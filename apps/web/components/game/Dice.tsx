"use client";
import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";

const PIPS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [[28, 28], [72, 72]],
  3: [[28, 28], [50, 50], [72, 72]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
  6: [[28, 26], [72, 26], [28, 50], [72, 50], [28, 74], [72, 74]],
};

export function DieFace({ value, size = 80, color = "#f4f1ff" }: { value: number; size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={`Die showing ${value}`}>
      <rect x="4" y="8" width="92" height="88" rx="20" fill="#0005" />
      <rect x="4" y="4" width="92" height="88" rx="20" fill={color} />
      {(PIPS[value] ?? []).map(([x, y], i) => (
        <circle key={i} cx={x} cy={y - 2} r="9" fill="#14112a" />
      ))}
    </svg>
  );
}

/** Tumbling die that settles on `value` when `rolling` turns false. */
export function RollingDie({ value, rolling, size = 90 }: { value: number; rolling: boolean; size?: number }) {
  const reduced = useReducedMotion();
  const [face, setFace] = useState(value);
  useEffect(() => {
    if (!rolling || reduced) {
      setFace(value);
      return;
    }
    const id = setInterval(() => setFace(1 + Math.floor(Math.random() * 6)), 70);
    return () => clearInterval(id);
  }, [rolling, value, reduced]);
  return (
    <motion.div
      animate={rolling && !reduced ? { rotate: [0, 90, 180, 270, 360], y: [0, -30, 0, -15, 0] } : { rotate: 0, y: 0, scale: [1.3, 1] }}
      transition={rolling ? { repeat: Infinity, duration: 0.5 } : { type: "spring", stiffness: 300, damping: 12 }}
    >
      <DieFace value={face} size={size} />
    </motion.div>
  );
}
