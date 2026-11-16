"use client";
import { useEffect, useState } from "react";
import { useStore } from "./store";

export function serverNow(): number {
  return Date.now() + useStore.getState().offset;
}

/** Re-renders every `intervalMs` with the current (server-synced) time. */
export function useNow(intervalMs = 200): number {
  const [now, setNow] = useState(() => serverNow());
  useEffect(() => {
    const id = setInterval(() => setNow(serverNow()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function useRemaining(endsAt: number | null | undefined, intervalMs = 200): number {
  const now = useNow(intervalMs);
  if (!endsAt) return 0;
  return Math.max(0, endsAt - now);
}
