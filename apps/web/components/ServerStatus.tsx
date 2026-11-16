"use client";
import { useEffect, useState } from "react";
import { getSocket, wakeServer } from "@/lib/socket";

/**
 * Free hosting puts the game server to sleep when nobody plays. Ping it as soon as the page
 * opens, and explain the wait instead of showing a silent spinner.
 */
export function ServerStatus() {
  const [waiting, setWaiting] = useState(false);
  useEffect(() => {
    wakeServer();
    const s = getSocket();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const arm = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setWaiting(!s.connected), 2500);
    };
    const onConnect = () => {
      if (timer) clearTimeout(timer);
      setWaiting(false);
    };
    s.on("connect", onConnect);
    s.on("disconnect", arm);
    s.io.on("reconnect_attempt", arm);
    if (!s.connected) arm();
    return () => {
      if (timer) clearTimeout(timer);
      s.off("connect", onConnect);
      s.off("disconnect", arm);
      s.io.off("reconnect_attempt", arm);
    };
  }, []);
  if (!waiting) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-3 bottom-3 z-[95] mx-auto max-w-md rounded-2xl bg-panel-2 p-4 text-center shadow-xl ring-2 ring-accent"
    >
      <p className="font-display text-xl text-accent">Waking up the game server…</p>
      <p className="mt-1 text-sm text-muted">
        It naps when nobody&apos;s playing (free hosting). This can take up to a minute — keep this page open.
      </p>
    </div>
  );
}
