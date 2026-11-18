"use client";
import { Check, UserMinus, UserPlus, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { acceptFriend, addFriend, removeFriend, useAccount } from "@/lib/account";
import { UserPhoto } from "./UserPhoto";

/** Profile page: add friends by username, answer requests, see who's online. */
export function FriendsManager() {
  const friends = useAccount((s) => s.friends);
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<{ text: string; good: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    const res = await addFriend({ username: name.trim() });
    setBusy(false);
    if (!res.ok) return setMsg({ text: res.message, good: false });
    setMsg({ text: res.status === "friends" ? `You and ${name.trim()} are now friends!` : `Request sent to ${name.trim()}.`, good: true });
    setName("");
  }

  const incoming = friends.filter((f) => f.status === "incoming");
  const accepted = friends.filter((f) => f.status === "friends");
  const outgoing = friends.filter((f) => f.status === "outgoing");

  return (
    <section className="card flex flex-col gap-4 p-5">
      <h2 className="font-display text-2xl">
        Friends <span className="text-muted">{accepted.length}</span>
      </h2>
      <form onSubmit={add} className="flex gap-2">
        <input
          className="input"
          placeholder="Add by username"
          aria-label="Friend's username"
          value={name}
          maxLength={20}
          autoCapitalize="none"
          onChange={(e) => {
            setName(e.target.value);
            setMsg(null);
          }}
        />
        <button className="btn-primary px-4" disabled={busy || !name.trim()} aria-label="Send friend request">
          <UserPlus size={20} />
        </button>
      </form>
      {msg && (
        <p className={`text-sm font-semibold ${msg.good ? "text-good" : "text-bad"}`} role="status">
          {msg.text}
        </p>
      )}

      {incoming.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="font-display text-lg text-accent">Requests</h3>
          {incoming.map((f) => (
            <Row key={f.user.id} user={f.user}>
              <button className="btn-primary min-h-11 px-3 text-base" onClick={() => acceptFriend(f.user.id)}>
                <Check size={18} /> Accept
              </button>
              <button className="btn-ghost min-h-11 min-w-11 px-2" aria-label={`Decline ${f.user.username}`} onClick={() => removeFriend(f.user.id)}>
                <X size={18} />
              </button>
            </Row>
          ))}
        </div>
      )}

      <ul className="flex flex-col gap-2">
        {accepted.map((f) => (
          <Row key={f.user.id} user={f.user} online={f.online} note={f.inRoom ? `In room ${f.inRoom}` : f.online ? "Online" : "Offline"}>
            <button
              className="btn-ghost min-h-11 min-w-11 px-2"
              aria-label={`Remove ${f.user.username}`}
              onClick={() => {
                if (confirm(`Remove ${f.user.username} from your friends?`)) void removeFriend(f.user.id);
              }}
            >
              <UserMinus size={18} />
            </button>
          </Row>
        ))}
        {accepted.length === 0 && <li className="text-muted">No friends yet. Add someone by their username!</li>}
      </ul>

      {outgoing.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="font-display text-lg text-muted">Sent requests</h3>
          {outgoing.map((f) => (
            <Row key={f.user.id} user={f.user} note="Waiting…">
              <button className="btn-ghost min-h-11 px-3 text-base" onClick={() => removeFriend(f.user.id)}>
                Cancel
              </button>
            </Row>
          ))}
        </div>
      )}
    </section>
  );
}

function Row({
  user,
  online,
  note,
  children,
}: {
  user: { username: string; photo: string | null };
  online?: boolean;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex list-none items-center gap-3 rounded-2xl bg-bg-2 p-2 pr-2">
      <UserPhoto user={user} size={44} online={online} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Link href={`/u/${encodeURIComponent(user.username)}`} className="truncate font-display text-xl hover:underline">
          {user.username}
        </Link>
        {note && <span className="text-sm text-muted">{note}</span>}
      </div>
      {children}
    </li>
  );
}
