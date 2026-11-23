"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage, GameEvent, JoinResult } from "@party-game/shared";
import { getSocket, send } from "./socket";
import { clearSeat, getSeat, profileToken, saveSeat } from "./session";
import { dispatchGameEvents, useStore } from "./store";

export type RoomStatus = "connecting" | "needsJoin" | "joining" | "joined" | "notFound" | "kicked";

/**
 * Connects to a room. Re-joins automatically with the seat token from localStorage
 * (refresh / network drop → same seat). Displays join without a seat.
 */
export function useRoom(code: string, wantDisplay: boolean) {
  const [status, setStatus] = useState<RoomStatus>("connecting");
  const [error, setError] = useState<string | null>(null);
  const statusRef = useRef(status);
  statusRef.current = status;

  const rejoin = useCallback(async () => {
    const seat = getSeat(code);
    if (seat && (!wantDisplay || seat.role === "display")) {
      setStatus("joining");
      const res = await send("room:join", { code, role: seat.role, token: seat.token });
      if (res.ok) {
        const r = res as unknown as JoinResult;
        saveSeat({ code, token: r.token, role: r.role, playerId: r.playerId });
        useStore.getState().setSeat(r.role, r.playerId ?? null);
        setStatus("joined");
        return;
      }
      if (res.code === "ROOM_NOT_FOUND") {
        clearSeat(code);
        setStatus("notFound");
        return;
      }
      // A flaky connection (timeout, rate limit, server hiccup) must not cost the seat: mid-game
      // there's no way back in without it. Keep it and try again shortly.
      if (["TIMEOUT", "RATE_LIMITED", "INTERNAL"].includes(res.code ?? "")) {
        setStatus("connecting");
        setTimeout(() => {
          if (getSocket().connected && statusRef.current === "connecting") void rejoin();
        }, 2000);
        return;
      }
      clearSeat(code);
    }
    if (wantDisplay) {
      setStatus("joining");
      const res = await send("room:join", { code, role: "display" });
      if (res.ok) {
        const r = res as unknown as JoinResult;
        saveSeat({ code, token: r.token, role: "display" });
        useStore.getState().setSeat("display", null);
        setStatus("joined");
      } else setStatus(res.code === "ROOM_NOT_FOUND" ? "notFound" : "needsJoin");
      return;
    }
    setStatus("needsJoin");
  }, [code, wantDisplay]);

  useEffect(() => {
    const s = getSocket();
    const st = useStore.getState();
    const onConnect = () => {
      st.setConnected(true);
      void rejoin();
    };
    const onDisconnect = () => st.setConnected(false);
    const onPublic = (p: any) => useStore.getState().setPublic(p);
    const onPrivate = (p: any) => useStore.getState().setPrivate(p);
    const onEvent = (evs: GameEvent[]) => dispatchGameEvents(evs);
    const onError = (e: { message: string }) => useStore.getState().toast(e.message, "error");
    const onChat = (m: ChatMessage) => useStore.getState().addChat(m);
    const onChatHistory = (ms: ChatMessage[]) => useStore.getState().setChat(ms);
    const onKicked = () => {
      clearSeat(code);
      useStore.getState().reset();
      setStatus("kicked");
    };
    s.on("connect", onConnect);
    s.on("disconnect", onDisconnect);
    s.on("state:public", onPublic);
    s.on("state:private", onPrivate);
    s.on("event", onEvent);
    s.on("error", onError);
    s.on("kicked", onKicked);
    s.on("chat:message", onChat);
    s.on("chat:history", onChatHistory);
    if (s.connected) onConnect();
    return () => {
      s.off("connect", onConnect);
      s.off("disconnect", onDisconnect);
      s.off("state:public", onPublic);
      s.off("state:private", onPrivate);
      s.off("event", onEvent);
      s.off("error", onError);
      s.off("kicked", onKicked);
      s.off("chat:message", onChat);
      s.off("chat:history", onChatHistory);
    };
  }, [code, rejoin]);

  const join = useCallback(
    async (name: string, color?: string, avatar?: string | null, usePhoto?: boolean) => {
      setError(null);
      setStatus("joining");
      const res = await send("room:join", { code, role: "player", name, color, avatar, profileToken: profileToken(), usePhoto });
      if (!res.ok) {
        setError(res.message);
        setStatus(res.code === "ROOM_NOT_FOUND" ? "notFound" : "needsJoin");
        return false;
      }
      const r = res as unknown as JoinResult;
      saveSeat({ code, token: r.token, role: r.role, playerId: r.playerId });
      useStore.getState().setSeat(r.role, r.playerId ?? null);
      setStatus("joined");
      return true;
    },
    [code],
  );

  const leave = useCallback(async () => {
    await send("room:leave", {});
    clearSeat(code);
    useStore.getState().reset();
  }, [code]);

  return { status, error, join, leave };
}

/** Send an action; show errors as toasts. */
export async function act<E extends Parameters<typeof send>[0]>(event: E, payload: Parameters<typeof send<E>>[1]) {
  const res = await send(event, payload);
  if (!res.ok) useStore.getState().toast(res.message, "error");
  return res;
}
