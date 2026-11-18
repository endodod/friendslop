"use client";
import { useEffect, useState } from "react";

/**
 * Local mini-game clock that stops while the host has paused the game. Solo mini-games time
 * themselves on each phone, so they use this instead of performance.now().
 * The web app calls setGamePaused() whenever the room's pause state changes.
 */
let pausedTotal = 0;
let pausedSince: number | null = null;
const listeners = new Set<(paused: boolean) => void>();

export function setGamePaused(paused: boolean) {
  const t = performance.now();
  if (paused && pausedSince === null) pausedSince = t;
  else if (!paused && pausedSince !== null) {
    pausedTotal += t - pausedSince;
    pausedSince = null;
  } else return;
  listeners.forEach((l) => l(paused));
}

export function isGamePaused(): boolean {
  return pausedSince !== null;
}

/** Like performance.now(), but frozen while paused. */
export function gameNow(): number {
  const t = performance.now();
  return t - pausedTotal - (pausedSince !== null ? t - pausedSince : 0);
}

/** Re-renders on pause/resume; calls `onChange` (if given) with the new state. */
export function useGamePaused(onChange?: (paused: boolean) => void): boolean {
  const [paused, setPaused] = useState(isGamePaused);
  useEffect(() => {
    const l = (p: boolean) => {
      setPaused(p);
      onChange?.(p);
    };
    listeners.add(l);
    return () => void listeners.delete(l);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return paused;
}
