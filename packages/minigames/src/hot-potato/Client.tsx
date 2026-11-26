"use client";
import { motion } from "framer-motion";
import { useEffect, useRef } from "react";
import type { MinigameClientProps } from "../kit/types";
import { Arena, ChunkyButton } from "../kit/visual";
import type { PublicPrompt } from "./logic";

interface Pub { alive: string[]; out: string[]; holder: string; prompt: PublicPrompt | null; boom: string | null; revive: boolean; locked: boolean; extraLife: string[] }

export function HotPotatoClient(p: MinigameClientProps<Pub>) {
  const mine = p.isParticipant && p.pub.holder === p.me && !p.pub.boom;
  const lastBoom = useRef<string | null>(null);
  useEffect(() => {
    if (p.pub.boom && p.pub.boom !== lastBoom.current) {
      p.ui.play("pop");
      p.ui.vibrate([200, 60, 200]);
    }
    lastBoom.current = p.pub.boom;
  }, [p.pub.boom, p.ui]);
  useEffect(() => {
    if (mine) p.ui.vibrate(40);
  }, [mine, p.ui]);
  const n = p.participants.length;
  const holderIdx = p.participants.indexOf(p.pub.holder);
  // Room for up to 8 around the circle: smaller seats and a slightly wider ring as it fills up.
  const crowded = n > 5;
  const avatarSize = n > 6 ? 46 : crowded ? 50 : 56;
  const radius = crowded ? 38 : 36;
  // A touch above centre: each seat has its name underneath, so the bottom one needs the room.
  const cy = 48;
  const posOf = (i: number) => {
    const ang = (i / n) * Math.PI * 2 - Math.PI / 2;
    return { x: 50 + Math.cos(ang) * radius, y: cy + Math.sin(ang) * radius };
  };
  const bombPos = holderIdx >= 0 ? posOf(holderIdx) : { x: 50, y: cy };
  return (
    <div className="flex flex-col items-center gap-4">
      <Arena
        tone={mine ? "#ff4d5e" : "#ff8a3d"}
        className="relative aspect-square w-full max-w-[min(100%,52dvh,560px)]"
        bg={`radial-gradient(60% 60% at 50% 50%, ${p.pub.boom ? "#ff4d5e55" : "#ff8a3d33"} 0%, transparent 70%), linear-gradient(180deg, #1d1838, #120f24)`}
      >
        {/* circle */}
        <span className="absolute rounded-full border-2 border-dashed border-white/15" style={{ left: `${50 - radius}%`, right: `${50 - radius}%`, top: `${cy - radius}%`, bottom: `${100 - cy - radius}%` }} />
        {p.participants.map((pid, i) => {
          const pos = posOf(i);
          const alive = p.pub.alive.includes(pid);
          return (
            <span
              key={pid}
              className={`absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5 ${alive ? "" : "opacity-40 grayscale"}`}
              style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
            >
              <span className="relative">
                <p.ui.Avatar player={p.players[pid]} size={avatarSize} dim={!alive} ring={p.pub.holder === pid} />
                {(p.pub.extraLife ?? []).includes(pid) && (
                  <span className="absolute -right-1 -top-1 text-lg drop-shadow" title="Bonus: one revive">
                    ❤️
                  </span>
                )}
              </span>
              <span className={`truncate font-display leading-tight ${crowded ? "max-w-16 text-xs" : "max-w-20 text-sm"}`}>{p.players[pid]?.name}</span>
            </span>
          );
        })}
        {/* the bomb flies to its holder */}
        {!p.pub.boom && holderIdx >= 0 && (
          <motion.span
            className="absolute -translate-x-1/2 -translate-y-1/2"
            animate={{ left: `${50 + (bombPos.x - 50) * 0.38}%`, top: `${cy + (bombPos.y - cy) * 0.38}%` }}
            transition={{ type: "spring", stiffness: 160, damping: 14 }}
          >
            <motion.span
              className="relative block"
              animate={{ rotate: [-12, 12, -12], scale: [1, 1.08, 1] }}
              transition={{ repeat: Infinity, duration: 0.35 }}
            >
              <span
                className="flex h-16 w-16 items-center justify-center rounded-full"
                style={{ background: "radial-gradient(circle at 35% 30%, #ff9a6b, #ff4d5e 55%, #8f1323)", boxShadow: "0 0 26px #ff4d5e, inset 0 -4px 0 #0004" }}
              >
                <p.ui.Icon id="bomb" size={40} className="text-[#14112a]" />
              </span>
              <motion.span
                aria-hidden
                className="absolute right-0 top-0 h-3 w-3 rounded-full bg-accent"
                animate={{ opacity: [1, 0.3, 1], scale: [1, 1.6, 1] }}
                transition={{ repeat: Infinity, duration: 0.25 }}
                style={{ boxShadow: "0 0 10px #ffc933" }}
              />
            </motion.span>
          </motion.span>
        )}
        {p.pub.boom && (
          <motion.span
            className="absolute inset-0 flex items-center justify-center"
            initial={{ scale: 0.3, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
          >
            <span className={`font-display text-accent drop-shadow-[0_0_20px_#ff4d5e] ${crowded ? "text-5xl" : "text-6xl"}`}>{p.pub.revive ? "SAVED!" : "BOOM!"}</span>
          </motion.span>
        )}
      </Arena>
      {/* Fixed height, so the answer buttons never jump around between prompts or turns. */}
      <div className="flex h-[19rem] w-full flex-col items-center">
      {p.pub.boom ? (
        p.pub.revive ? (
          <p className="font-display text-3xl text-good">{p.players[p.pub.boom]?.name} used their revive!</p>
        ) : (
          <p className="font-display text-3xl text-bad">{p.players[p.pub.boom]?.name} is out!</p>
        )
      ) : mine ? (
        <div className="flex w-full flex-col items-center gap-2">
          <p className="font-display text-2xl leading-tight text-bad">You have the bomb! Quick, pass it:</p>
          {p.pub.prompt && (
            <Challenge
              prompt={p.pub.prompt}
              locked={p.pub.locked}
              Icon={p.ui.Icon}
              onPick={(i) => {
                p.input({ choice: i });
                p.ui.vibrate(15);
              }}
            />
          )}
        </div>
      ) : (
        <p className="font-display text-2xl">{p.players[p.pub.holder]?.name} has the bomb…</p>
      )}
      </div>
    </div>
  );
}

const INSTRUCTION: Record<PublicPrompt["kind"], string> = {
  match: "Tap the same picture",
  ink: "Tap the INK colour, not the word",
  odd: "Tap the odd one out",
  count: "How many dots?",
};

/** One quick challenge: a question area and three big buttons. */
function Challenge({
  prompt,
  locked,
  onPick,
  Icon,
}: {
  prompt: PublicPrompt;
  locked: boolean;
  onPick: (i: number) => void;
  Icon: MinigameClientProps["ui"]["Icon"];
}) {
  return (
    <div className="flex w-full flex-col items-center gap-2">
      <p className="h-7 font-display text-xl leading-7 text-muted">{INSTRUCTION[prompt.kind]}</p>
      {/* Same height for every kind of prompt; only this part animates, never the buttons. */}
      <motion.div key={JSON.stringify(prompt)} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex h-24 w-full items-center justify-center">
      {prompt.kind === "match" && (
        <span className="flex h-24 w-24 items-center justify-center rounded-3xl bg-accent/20 text-accent ring-2 ring-accent">
          <Icon id={prompt.icon} size={64} />
        </span>
      )}
      {prompt.kind === "ink" && (
        <p className="font-display text-6xl leading-none drop-shadow-[0_3px_0_#000a]" style={{ color: prompt.ink }}>
          {prompt.word}
        </p>
      )}
      {prompt.kind === "count" && (
        <div className="relative h-24 w-full max-w-xs rounded-2xl bg-bg-2">
          {prompt.dots.map((d, i) => (
            <span key={i} className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent shadow-[0_0_8px_#ffc933]" style={{ left: `${d.x}%`, top: `${d.y}%` }} />
          ))}
        </div>
      )}
      </motion.div>
      <div className="grid w-full grid-cols-3 gap-2">
        {prompt.choices.map((c, i) => (
          <ChunkyButton
            key={`${c}-${i}`}
            ariaLabel={prompt.kind === "ink" ? `colour ${i + 1}` : prompt.kind === "count" ? c : `${c} ${i + 1}`}
            disabled={locked}
            color={prompt.kind === "ink" ? c : "#3a3462"}
            textColor="#f4f1ff"
            className="flex h-16 items-center justify-center text-3xl"
            onClick={() => onPick(i)}
          >
            {prompt.kind === "count" ? c : prompt.kind === "ink" ? "" : <Icon id={c} size={44} />}
          </ChunkyButton>
        ))}
      </div>
    </div>
  );
}
