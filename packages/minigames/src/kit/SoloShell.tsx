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
  return Math.max(500, Math.min(localLimitMs, p.endsAt - p.now() - 500));
}

import { useEffect, useRef } from "react";

/** Submit whatever the player has when the round is about to end (if they haven't yet). */
export function useDeadlineSubmit(p: MinigameClientProps, payload: () => unknown, done: boolean, setDone: (d: boolean) => void) {
  const ref = useRef(payload);
  ref.current = payload;
  const doneRef = useRef(done);
  doneRef.current = done;
  useEffect(() => {
    if (!p.isParticipant) return;
    const t = setTimeout(() => {
      if (doneRef.current) return;
      setDone(true);
      p.submit(ref.current());
    }, Math.max(300, p.endsAt - p.now() - 600));
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
