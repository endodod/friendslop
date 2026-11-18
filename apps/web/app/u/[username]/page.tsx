"use client";
import { Check, UserPlus } from "lucide-react";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import type { FriendStatus, PublicUser } from "@party-game/shared";
import { acceptFriend, addFriend, api, loadAccount, useAccount } from "@/lib/account";
import { StatsGrid } from "@/components/account/StatsGrid";
import { UserPhoto } from "@/components/account/UserPhoto";

export default function PublicProfile({ params }: { params: Promise<{ username: string }> }) {
  const { username } = use(params);
  const me = useAccount((s) => s.user);
  const [data, setData] = useState<{ user: PublicUser; friendStatus: FriendStatus } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadAccount().then(async () => {
      const res = await api<{ user: PublicUser; friendStatus: FriendStatus }>(`/users/by-name/${encodeURIComponent(username)}`);
      if (res.ok) setData({ user: res.user, friendStatus: res.friendStatus });
      else setError(res.message);
    });
  }, [username, me?.id]);

  if (error)
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="font-display text-3xl">{error}</p>
        <Link href="/" className="btn-primary">Back</Link>
      </main>
    );
  if (!data)
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <p className="animate-pulse font-display text-3xl">Loading…</p>
      </main>
    );

  const { user, friendStatus } = data;
  const setStatus = (s: FriendStatus) => setData({ ...data, friendStatus: s });

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-4 py-6">
      <header>
        <Link href={me ? "/profile" : "/"} className="btn-ghost min-h-11 px-2">← Back</Link>
      </header>
      <section className="card flex flex-col items-center gap-3 p-5 text-center">
        <UserPhoto user={user} size={128} />
        <h1 className="font-display text-4xl">{user.username}</h1>
        <p className="text-sm text-muted">Playing since {new Date(user.createdAt).toLocaleDateString()}</p>
        {me && friendStatus === "none" && (
          <button
            className="btn-primary"
            onClick={async () => {
              const res = await addFriend({ userId: user.id });
              if (res.ok) setStatus(res.status);
            }}
          >
            <UserPlus size={20} /> Add friend
          </button>
        )}
        {me && friendStatus === "incoming" && (
          <button
            className="btn-primary"
            onClick={async () => {
              const res = await acceptFriend(user.id);
              if (res.ok) setStatus("friends");
            }}
          >
            <Check size={20} /> Accept friend request
          </button>
        )}
        {friendStatus === "outgoing" && <p className="text-muted">Friend request sent</p>}
        {friendStatus === "friends" && <p className="font-display text-good">Friends</p>}
        {friendStatus === "self" && <Link href="/profile" className="btn-secondary">Edit your profile</Link>}
        {!me && (
          <Link href="/login" className="btn-secondary">
            Sign in to add friends
          </Link>
        )}
      </section>
      <section className="card flex flex-col gap-3 p-5">
        <h2 className="font-display text-2xl">Stats</h2>
        <StatsGrid stats={user.stats} />
      </section>
    </main>
  );
}
