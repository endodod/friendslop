"use client";
import { motion } from "framer-motion";
import { Minus, Plus } from "lucide-react";
import { useState } from "react";
import type { MinigameClientProps } from "../kit/types";
import { Arena, ChunkyButton, Hud, Pill } from "../kit/visual";
import { BID_MS, BOXES } from "./logic";

interface Pub { endsAt: number; locked: string[]; revealed: boolean; contents: number[] | null; bids: Record<string, number[]> | null; winners: (string | null)[] | null }
interface Priv { wallet: number; myBids: number[] | null; peek: { box: number; value: number } | null }

export function MysteryAuctionClient(p: MinigameClientProps<Pub, Priv>) {
  const [bids, setBids] = useState<number[]>(Array(BOXES).fill(0));
  const wallet = p.priv?.wallet ?? 0;
  const total = bids.reduce((a, b) => a + b, 0);
  const canBid = p.isParticipant && !p.priv?.myBids && !p.pub.revealed;
  const set = (i: number, d: number) => setBids((b) => b.map((v, k) => (k === i ? Math.max(0, v + d) : v)));
  const BOX_COLORS = ["#b26bff", "#3d8bff", "#ff6bc6"];
  return (
    <div className="flex flex-col gap-4">
      {!p.pub.revealed && <p.ui.Timer endsAt={p.pub.endsAt} totalMs={BID_MS} />}
      {canBid && (
        <Hud left={<Pill tone="#ffc933">Wallet {wallet}</Pill>} right={<Pill tone={wallet - total > 0 ? "#2fd27a" : "#ff4d5e"}>Left {wallet - total}</Pill>} />
      )}
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: BOXES }, (_, i) => {
          const winner = p.pub.winners?.[i];
          const value = p.pub.contents?.[i];
          const c = BOX_COLORS[i % BOX_COLORS.length];
          const good = (value ?? 0) >= 0;
          return (
            <Arena key={i} tone={c} className="flex flex-col items-center gap-2 p-3">
              <div className="relative flex h-24 w-full items-end justify-center">
                {/* lid */}
                <motion.span
                  className="absolute top-1 z-10 h-5 w-[86%] rounded-md"
                  style={{ background: `linear-gradient(180deg, color-mix(in srgb, ${c} 100%, white 25%), ${c})`, boxShadow: "0 3px 0 #0004" }}
                  animate={p.pub.revealed ? { y: -26, rotate: -18, opacity: 0.9 } : { y: [0, -2, 0] }}
                  transition={p.pub.revealed ? { duration: 0.5, delay: i * 0.3 } : { repeat: Infinity, duration: 1.6, delay: i * 0.2 }}
                />
                {/* box */}
                <span
                  className="relative flex h-[72%] w-[76%] items-center justify-center rounded-md font-display text-2xl"
                  style={{
                    background: `linear-gradient(180deg, ${c}, color-mix(in srgb, ${c} 65%, black))`,
                    boxShadow: "inset 0 -5px 0 #0003",
                  }}
                >
                  {/* ribbon */}
                  <span className="absolute inset-y-0 left-1/2 w-3 -translate-x-1/2 bg-accent/90" />
                  {p.pub.revealed ? (
                    <motion.span
                      initial={{ y: 10, scale: 0.4, opacity: 0 }}
                      animate={{ y: -30, scale: 1, opacity: 1 }}
                      transition={{ delay: 0.3 + i * 0.3, type: "spring" }}
                      className={`relative z-20 rounded-xl px-2 ${good ? "bg-good text-[#06210f]" : "bg-bad text-white"}`}
                    >
                      {value! >= 0 ? `+${value}` : value}
                    </motion.span>
                  ) : (
                    <span className="relative rounded-full bg-[#14112a]/70 px-2 text-white">
                      {p.priv?.peek?.box === i ? `${p.priv.peek.value}` : "?"}
                    </span>
                  )}
                </span>
              </div>
              <span className="font-display">Box {i + 1}</span>
              {p.pub.revealed && (
                <span className="flex items-center gap-1 text-sm">
                  {winner ? (
                    <>
                      <p.ui.Avatar player={p.players[winner]} size={24} /> paid {p.pub.bids?.[winner]?.[i]}
                    </>
                  ) : (
                    "no bids"
                  )}
                </span>
              )}
              {canBid && (
                <div className="flex w-full flex-col items-center gap-1">
                  <span className="font-display text-3xl tabular-nums text-accent">{bids[i]}</span>
                  <div className="flex gap-1.5">
                    <button className="btn-secondary min-h-10 min-w-10 px-1" aria-label={`Lower bid on box ${i + 1}`} onClick={() => set(i, -1)}><Minus size={18} /></button>
                    <button className="btn-secondary min-h-10 min-w-10 px-1" aria-label={`Raise bid on box ${i + 1}`} disabled={total >= wallet} onClick={() => set(i, 1)}><Plus size={18} /></button>
                  </div>
                </div>
              )}
            </Arena>
          );
        })}
      </div>
      {p.priv?.peek && !p.pub.revealed && <p className="text-center text-accent">Bonus: you peeked into box {p.priv.peek.box + 1}.</p>}
      {canBid && (
        <ChunkyButton color="#ffc933" className="min-h-14 text-2xl" disabled={total > wallet} onClick={() => p.input({ bids })}>
          Lock in bids
        </ChunkyButton>
      )}
      {!canBid && !p.pub.revealed && (
        <div className="flex items-center justify-center gap-2">
          {p.participants.map((pid) => (
            <p.ui.Avatar key={pid} player={p.players[pid]} size={32} dim={!p.pub.locked.includes(pid)} ring={p.pub.locked.includes(pid)} />
          ))}
          <span className="text-muted">{p.pub.locked.length}/{p.participants.length} locked in</span>
        </div>
      )}
    </div>
  );
}
