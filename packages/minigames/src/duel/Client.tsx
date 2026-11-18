"use client";
import type { Answer } from "@party-game/shared";
import { motion } from "framer-motion";
import type { MinigameClientProps } from "../kit/types";
import { Arena } from "../kit/visual";
import type { DuelPublic } from "./logic";

export function DuelClient(p: MinigameClientProps<DuelPublic, { myAnswer: Answer | null }>) {
  const [c, o] = p.pub.duelists;
  if (!p.pub.round) return <p className="text-center text-muted">{p.pub.reason}</p>;
  return (
    <div className="flex flex-col gap-4">
      <Arena tone="#ff4d5e" className="flex items-center justify-center gap-4 py-4" pattern="stripes"
        bg="linear-gradient(90deg, #3d8bff44 0%, transparent 45%, transparent 55%, #ff4d5e44 100%), linear-gradient(180deg, #1d1838, #120f24)">
        <motion.div initial={{ x: -60, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="flex flex-col items-center gap-1">
          <p.ui.Avatar player={p.players[c]} size={56} ring={p.pub.winner === c} dim={p.pub.loser === c} />
          <span className="max-w-24 truncate font-display">{p.players[c]?.name}</span>
        </motion.div>
        <motion.span
          initial={{ scale: 3, opacity: 0, rotate: -20 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 14, delay: 0.2 }}
          className="font-display text-5xl text-accent drop-shadow-[0_0_14px_#ffc933aa]"
        >
          VS
        </motion.span>
        <motion.div initial={{ x: 60, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="flex flex-col items-center gap-1">
          <p.ui.Avatar player={p.players[o]} size={56} ring={p.pub.winner === o} dim={p.pub.loser === o} />
          <span className="max-w-24 truncate font-display">{p.players[o]?.name}</span>
        </motion.div>
      </Arena>
      <p.ui.QuestionRound
        round={p.pub.round}
        display={p.display}
        myAnswer={p.priv?.myAnswer ?? null}
        onAnswer={async (answer) => p.input({ answer })}
        totalAnswerMs={15000}
      />
      {p.pub.reason && (
        <motion.p
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="rounded-[24px] p-4 text-center font-display text-2xl"
          style={{ background: "linear-gradient(180deg, #ffc93333, #ffc93311)", boxShadow: "inset 0 0 0 2px #ffc933aa" }}
        >
          {p.pub.reason}
          {p.pub.winner && p.pub.loser && (
            <span className="block text-lg text-accent">
              {p.players[p.pub.winner]?.name} steals 5 coins from {p.players[p.pub.loser]?.name}!
            </span>
          )}
        </motion.p>
      )}
    </div>
  );
}
