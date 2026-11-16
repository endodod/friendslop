"use client";
import { motion } from "framer-motion";
import { Minus, Plus } from "lucide-react";
import { useState } from "react";
import type { MinigameClientProps } from "../kit/types";
import { BID_MS, BOXES } from "./logic";

interface Pub { endsAt: number; locked: string[]; revealed: boolean; contents: number[] | null; bids: Record<string, number[]> | null; winners: (string | null)[] | null }
interface Priv { wallet: number; myBids: number[] | null; peek: { box: number; value: number } | null }

export function MysteryAuctionClient(p: MinigameClientProps<Pub, Priv>) {
  const [bids, setBids] = useState<number[]>(Array(BOXES).fill(0));
  const wallet = p.priv?.wallet ?? 0;
  const total = bids.reduce((a, b) => a + b, 0);
  const canBid = p.isParticipant && !p.priv?.myBids && !p.pub.revealed;
  const set = (i: number, d: number) => setBids((b) => b.map((v, k) => (k === i ? Math.max(0, v + d) : v)));
  return (
    <div className="flex flex-col gap-4">
      {!p.pub.revealed && <p.ui.Timer endsAt={p.pub.endsAt} totalMs={BID_MS} />}
      {canBid && <p className="text-center text-muted">You have {wallet} coins. Bids left: {wallet - total}</p>}
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: BOXES }, (_, i) => {
          const winner = p.pub.winners?.[i];
          const value = p.pub.contents?.[i];
          return (
            <div key={i} className="flex flex-col items-center gap-2 rounded-3xl bg-bg-2 p-3">
              <motion.div
                animate={p.pub.revealed ? { rotateY: [90, 0] } : {}}
                className={`flex h-20 w-20 items-center justify-center rounded-2xl font-display text-3xl ${p.pub.revealed ? ((value ?? 0) >= 0 ? "bg-good text-[#06210f]" : "bg-bad text-white") : "bg-[#b26bff] text-white"}`}
              >
                {p.pub.revealed ? (value! >= 0 ? `+${value}` : value) : p.priv?.peek?.box === i ? `${p.priv.peek.value}?` : "?"}
              </motion.div>
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
            </div>
          );
        })}
      </div>
      {canBid && (
        <ul className="flex flex-col gap-2">
          {Array.from({ length: BOXES }, (_, i) => (
            <li key={i} className="flex items-center gap-3 rounded-2xl bg-bg-2 px-3 py-1">
              <span className="flex-1 font-display text-lg">Bid on box {i + 1}</span>
              <button className="btn-secondary min-h-11 min-w-11 px-1" aria-label={`Lower bid on box ${i + 1}`} onClick={() => set(i, -1)}><Minus size={18} /></button>
              <span className="w-10 text-center font-display text-2xl">{bids[i]}</span>
              <button className="btn-secondary min-h-11 min-w-11 px-1" aria-label={`Raise bid on box ${i + 1}`} disabled={total >= wallet} onClick={() => set(i, 1)}><Plus size={18} /></button>
            </li>
          ))}
        </ul>
      )}
      {p.priv?.peek && !p.pub.revealed && <p className="text-center text-accent">Bonus: you peeked into box {p.priv.peek.box + 1}.</p>}
      {canBid && (
        <button className="btn-primary min-h-14 text-2xl" disabled={total > wallet} onClick={() => p.input({ bids })}>
          Lock in bids
        </button>
      )}
      {!canBid && !p.pub.revealed && <p className="text-center text-muted">{p.pub.locked.length}/{p.participants.length} locked in</p>}
    </div>
  );
}
