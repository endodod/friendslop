"use client";
import { useEffect, useState } from "react";
import type { Board } from "@party-game/shared";
import { serverUrl } from "./socket";

const cache = new Map<string, Board>();

/** Board geometry is content on the server; fetched once and cached. */
export function useBoard(id: string | undefined): Board | null {
  const [board, setBoard] = useState<Board | null>(id ? (cache.get(id) ?? null) : null);
  useEffect(() => {
    if (!id) return;
    if (cache.has(id)) return setBoard(cache.get(id)!);
    let cancelled = false;
    fetch(`${serverUrl()}/content/boards/${id}`)
      .then((r) => r.json())
      .then((b: Board) => {
        cache.set(id, b);
        if (!cancelled) setBoard(b);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [id]);
  return board;
}
