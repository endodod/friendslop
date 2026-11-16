"use client";
import { useEffect } from "react";
import { onGameEvent } from "@/lib/store";
import { play, vibrate } from "@/lib/sfx";

/** Plays sounds for server events that ask for one. Visual effects subscribe separately. */
export function SfxBridge() {
  useEffect(
    () =>
      onGameEvent((e) => {
        if (e.type === "sfx") play(e.id);
        if (e.type === "diceRolled") play("dice");
        if (e.type === "answerLocked") play("lock", { volume: 0.4 });
        if (e.type === "shieldBlocked") vibrate(60);
        if (e.type === "eventDrawn") play("event");
      }),
    [],
  );
  return null;
}
