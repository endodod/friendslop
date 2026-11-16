"use client";
import { io, type Socket } from "socket.io-client";
import type { Ack, ClientEventName, ClientPayload, ServerToClientEvents } from "@party-game/shared";

let socket: Socket<ServerToClientEvents, any> | null = null;

export function serverUrl(): string {
  // Tolerate "https://host/" as well as "https://host".
  if (process.env.NEXT_PUBLIC_SERVER_URL) return process.env.NEXT_PUBLIC_SERVER_URL.trim().replace(/\/+$/, "");
  if (typeof window === "undefined") return "http://localhost:4000";
  // Same host as the web page so phones on the LAN reach the game server too.
  return `${window.location.protocol}//${window.location.hostname}:4000`;
}

export function getSocket(): Socket<ServerToClientEvents, any> {
  if (!socket) {
    socket = io(serverUrl(), { transports: ["websocket", "polling"], autoConnect: true, reconnection: true });
  }
  return socket;
}

/** Fire a request at the server's health endpoint so a sleeping free-tier server starts booting. */
export function wakeServer() {
  if (typeof window === "undefined") return;
  fetch(`${serverUrl()}/health`, { mode: "no-cors", cache: "no-store" }).catch(() => {});
}

/** Emit with an ack, as a promise. Never throws; returns { ok: false } on failure/timeout. */
export function send<E extends ClientEventName>(event: E, payload: ClientPayload<E>, timeoutMs = 8000): Promise<Ack<any>> {
  const s = getSocket();
  return new Promise((resolve) => {
    s.timeout(timeoutMs).emit(event, payload, (err: unknown, res: Ack<any>) => {
      if (err) resolve({ ok: false, code: "TIMEOUT", message: "The server didn't answer. Check your connection." });
      else resolve(res);
    });
  });
}
