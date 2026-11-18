"use client";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { RoomInvite } from "@party-game/shared";
import { loadAccount, refreshFriends, useAccount } from "@/lib/account";
import { getSocket } from "@/lib/socket";
import { play } from "@/lib/sfx";
import { UserPhoto } from "./UserPhoto";

const INVITE_TTL_MS = 60_000;

/**
 * Mounted once in the root layout: loads the signed-in account, keeps the friend list fresh and
 * shows room invites from friends on every page.
 */
export function AccountProvider() {
  const router = useRouter();
  const [invites, setInvites] = useState<RoomInvite[]>([]);
  const user = useAccount((s) => s.user);

  useEffect(() => {
    void loadAccount();
    const s = getSocket();
    const onInvite = (inv: RoomInvite) => {
      setInvites((list) => [...list.filter((i) => i.from.userId !== inv.from.userId), inv].slice(-3));
      play("join");
    };
    const onFriends = () => void refreshFriends();
    s.on("invite", onInvite);
    s.on("friends:changed", onFriends);
    return () => {
      s.off("invite", onInvite);
      s.off("friends:changed", onFriends);
    };
  }, []);

  // Drop stale invites.
  useEffect(() => {
    if (!invites.length) return;
    const t = setInterval(() => setInvites((list) => list.filter((i) => Date.now() - i.at < INVITE_TTL_MS)), 5000);
    return () => clearInterval(t);
  }, [invites.length]);

  if (!user) return null;
  const dismiss = (inv: RoomInvite) => setInvites((list) => list.filter((i) => i !== inv));

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-3 z-[95] flex flex-col items-center gap-2 px-4" aria-live="polite">
      <AnimatePresence>
        {invites.map((inv) => (
          <motion.div
            key={`${inv.from.userId}-${inv.at}`}
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            className="card pointer-events-auto flex w-full max-w-md items-center gap-3 p-3"
            role="alertdialog"
            aria-label={`Invite from ${inv.from.username}`}
          >
            <UserPhoto user={{ username: inv.from.username, photo: inv.from.photo }} size={44} />
            <p className="min-w-0 flex-1">
              <span className="font-display text-lg">{inv.from.username}</span>{" "}
              <span className="text-muted">invited you to room</span>{" "}
              <span className="font-display tracking-widest text-accent">{inv.code}</span>
            </p>
            <button
              className="btn-primary min-h-11 px-4"
              onClick={() => {
                dismiss(inv);
                router.push(`/r/${inv.code}`);
              }}
            >
              Join
            </button>
            <button className="btn-ghost min-h-11 min-w-11 px-2" aria-label="Dismiss invite" onClick={() => dismiss(inv)}>
              <X size={18} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
