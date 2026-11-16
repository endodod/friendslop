"use client";
import { create } from "zustand";
import type { GameEvent, PrivateState, PublicRoomState } from "@party-game/shared";

export interface ToastMsg {
  id: number;
  text: string;
  tone: "info" | "error" | "good";
}

interface Store {
  connected: boolean;
  pub: PublicRoomState | null;
  priv: PrivateState | null;
  /** serverNow - localNow */
  offset: number;
  role: "player" | "display" | null;
  playerId: string | null;
  toasts: ToastMsg[];
  muted: boolean;
  setConnected(c: boolean): void;
  setPublic(p: PublicRoomState): void;
  setPrivate(p: PrivateState): void;
  setSeat(role: "player" | "display" | null, playerId: string | null): void;
  toast(text: string, tone?: ToastMsg["tone"]): void;
  dismiss(id: number): void;
  setMuted(m: boolean): void;
  reset(): void;
}

let toastId = 0;

export const useStore = create<Store>((set) => ({
  connected: false,
  pub: null,
  priv: null,
  offset: 0,
  role: null,
  playerId: null,
  toasts: [],
  muted: false,
  setConnected: (connected) => set({ connected }),
  setPublic: (pub) =>
    set((s) => {
      // Smooth clock offset estimate (server time ≈ local time + offset).
      const sample = pub.serverNow - Date.now();
      const offset = s.pub ? s.offset * 0.8 + sample * 0.2 : sample;
      return { pub, offset };
    }),
  setPrivate: (priv) => set({ priv }),
  setSeat: (role, playerId) => set({ role, playerId }),
  toast: (text, tone = "info") =>
    set((s) => {
      const id = ++toastId;
      setTimeout(() => useStore.getState().dismiss(id), 3500);
      return { toasts: [...s.toasts.slice(-3), { id, text, tone }] };
    }),
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  setMuted: (muted) => set({ muted }),
  reset: () => set({ pub: null, priv: null, role: null, playerId: null }),
}));

// --- game events (for animations / sfx) ---------------------------------------------------
type Listener = (e: GameEvent) => void;
const listeners = new Set<Listener>();
export function onGameEvent(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function dispatchGameEvents(events: GameEvent[]) {
  for (const e of events) for (const l of listeners) l(e);
}
