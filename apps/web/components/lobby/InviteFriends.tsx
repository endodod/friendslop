"use client";
import { Send, UserPlus } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { GAME_CONFIG } from "@party-game/shared";
import { addFriend, refreshFriends, useAccount } from "@/lib/account";
import { useStore } from "@/lib/store";
import { act } from "@/lib/useRoom";
import { UserPhoto } from "../account/UserPhoto";

const RESEND_MS = 15_000;

/** Lobby: invite friends from your friend list straight into this room. */
export function InviteFriends() {
  const user = useAccount((s) => s.user);
  const loaded = useAccount((s) => s.loaded);
  const friends = useAccount((s) => s.friends);
  const players = useStore((s) => s.pub?.players ?? []);
  const [sent, setSent] = useState<Record<string, number>>({});
  const [, force] = useState(0);

  // Online status can change without an event reaching us (e.g. the server restarted): refresh now and then.
  useEffect(() => {
    if (!user) return;
    void refreshFriends();
    const t = setInterval(() => void refreshFriends(), 20_000);
    return () => clearInterval(t);
  }, [user]);
  // Re-enable "Invite" buttons once the cooldown passes.
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 3000);
    return () => clearInterval(t);
  }, []);

  if (!loaded) return null;
  if (!user)
    return (
      <section className="card flex items-center justify-between gap-3 p-4">
        <p className="text-muted">Sign in to invite friends from your friend list.</p>
        <Link href="/login" className="btn-secondary min-h-11 shrink-0 px-4 text-base">
          Sign in
        </Link>
      </section>
    );

  const here = new Set(players.map((p) => p.userId).filter(Boolean));
  const full = players.length >= GAME_CONFIG.players.max;
  const list = friends.filter((f) => f.status === "friends");
  // Signed-in players in this lobby you aren't connected with yet.
  const known = new Set(friends.map((f) => f.user.id));
  const strangers = players.filter((p) => p.userId && p.userId !== user.id && !known.has(p.userId));

  return (
    <section className="card flex flex-col gap-3 p-5">
      <h2 className="font-display text-2xl">Invite friends</h2>
      {list.length === 0 && (
        <p className="text-muted">
          No friends yet. Add some on your{" "}
          <Link href="/profile" className="underline">
            profile
          </Link>
          .
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {list.map((f) => {
          const inThisRoom = here.has(f.user.id);
          const cooling = Date.now() - (sent[f.user.id] ?? 0) < RESEND_MS;
          const note = inThisRoom ? "In this room" : f.inRoom ? `In room ${f.inRoom}` : f.online ? "Online" : "Offline";
          return (
            <li key={f.user.id} className="flex items-center gap-3 rounded-2xl bg-bg-2 p-2">
              <UserPhoto user={f.user} size={40} online={f.online} />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-display text-lg">{f.user.username}</span>
                <span className="text-sm text-muted">{note}</span>
              </div>
              {!inThisRoom && (
                <button
                  className="btn-primary min-h-11 px-3 text-base"
                  disabled={!f.online || full || cooling}
                  onClick={async () => {
                    setSent((s) => ({ ...s, [f.user.id]: Date.now() }));
                    const res = await act("friend:invite", { userId: f.user.id });
                    if (res.ok) useStore.getState().toast(`Invite sent to ${f.user.username}`, "good");
                  }}
                >
                  <Send size={16} /> {cooling ? "Sent" : "Invite"}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {strangers.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-line pt-3">
          <span className="text-sm text-muted">Playing with people you don&apos;t know yet?</span>
          <div className="flex flex-wrap gap-2">
            {strangers.map((p) => (
              <button
                key={p.id}
                className="btn-secondary min-h-10 px-3 text-base"
                onClick={async () => {
                  const res = await addFriend({ userId: p.userId! });
                  useStore
                    .getState()
                    .toast(res.ok ? (res.status === "friends" ? `You're now friends with ${p.username}` : `Friend request sent to ${p.username}`) : res.message, res.ok ? "good" : "error");
                }}
              >
                <UserPlus size={16} /> {p.username}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
