"use client";
import type { SoloPrivate, SoloPublic } from "@party-game/shared";
import type { MinigameClientProps } from "./types";
import { SoloStatus, SubmittedNotice } from "./hooks";

/** Shows the "done + who finished" view for solo games once submitted / for spectators. */
export function SoloDone({ p, label }: { p: MinigameClientProps<SoloPublic, SoloPrivate>; label?: string }) {
  return (
    <div className="flex flex-col gap-3">
      {p.isParticipant && <SubmittedNotice label={label ?? (p.me ? p.pub.labels[p.me] : "")} />}
      <SoloStatus participants={p.participants} submitted={p.pub.submitted} labels={p.pub.labels} players={p.players} Avatar={p.ui.Avatar} />
    </div>
  );
}

/** Calls `onEnd` shortly before the server deadline so local runs always get submitted. */
export function deadlineMs(p: MinigameClientProps, localLimitMs: number): number {
  // Untimed mini-games (endsAt 0) have no server deadline.
  if (!p.endsAt) return localLimitMs;
  return Math.max(500, Math.min(localLimitMs, p.endsAt - p.now() - 500));
}

import { useEffect, useRef } from "react";

/** Submit whatever the player has when the round is about to end (if they haven't yet). */
export function useDeadlineSubmit(p: MinigameClientProps, payload: () => unknown, done: boolean, setDone: (d: boolean) => void) {
  const ref = useRef(payload);
  ref.current = payload;
  const doneRef = useRef(done);
  doneRef.current = done;
  const nowRef = useRef(p.now);
  nowRef.current = p.now;
  useEffect(() => {
    // Untimed mini-games (endsAt 0): nothing to beat, the player finishes when they're done.
    if (!p.isParticipant || !p.endsAt) return;
    // Poll the (pause-aware) server clock instead of one long timeout, so a pause holds the deadline.
    const id = setInterval(() => {
      if (doneRef.current || p.endsAt - nowRef.current() > 600) return;
      clearInterval(id);
      setDone(true);
      p.submit(ref.current());
    }, 200);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
