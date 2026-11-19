"use client";
import { KeyRound, UserPen } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { PublicUser } from "@party-game/shared";
import { api, useAccount } from "@/lib/account";

type Status = { kind: "ok" | "error"; text: string } | null;

function StatusLine({ status }: { status: Status }) {
  if (!status) return null;
  return (
    <p className={`text-sm font-semibold ${status.kind === "ok" ? "text-good" : "text-bad"}`} role={status.kind === "error" ? "alert" : "status"}>
      {status.text}
    </p>
  );
}

/** Change username / change password, shown at the bottom of the account page. */
export function AccountSettings({ user }: { user: PublicUser }) {
  const [username, setUsername] = useState(user.username);
  const [nameBusy, setNameBusy] = useState(false);
  const [nameStatus, setNameStatus] = useState<Status>(null);

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwStatus, setPwStatus] = useState<Status>(null);

  async function changeName(e: FormEvent) {
    e.preventDefault();
    const name = username.trim();
    if (name === user.username) return;
    setNameBusy(true);
    setNameStatus(null);
    const res = await api<{ user: PublicUser }>("/me/username", { method: "PUT", json: { username: name } });
    setNameBusy(false);
    if (res.ok) {
      useAccount.getState().setUser(res.user);
      setUsername(res.user.username);
      setNameStatus({ kind: "ok", text: "Username changed." });
    } else setNameStatus({ kind: "error", text: res.message });
  }

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    setPwStatus(null);
    if (next.length < 8) return setPwStatus({ kind: "error", text: "Passwords need at least 8 characters." });
    if (next !== confirm) return setPwStatus({ kind: "error", text: "The new passwords don't match." });
    setPwBusy(true);
    const res = await api("/me/password", { method: "PUT", json: { currentPassword: current, newPassword: next } });
    setPwBusy(false);
    if (res.ok) {
      setCurrent("");
      setNext("");
      setConfirm("");
      setPwStatus({ kind: "ok", text: "Password changed. Other devices were signed out." });
    } else setPwStatus({ kind: "error", text: res.message });
  }

  return (
    <section className="card flex flex-col gap-5 p-5">
      <h2 className="font-display text-2xl">Account</h2>

      <form className="flex flex-col gap-2" onSubmit={changeName}>
        <label className="flex flex-col gap-2">
          <span className="font-display text-lg">Username</span>
          <input
            className="input"
            value={username}
            maxLength={20}
            autoComplete="username"
            autoCapitalize="none"
            onChange={(e) => setUsername(e.target.value)}
          />
          <span className="text-sm text-muted">3–20 letters, numbers or underscores.</span>
        </label>
        <button className="btn-primary min-h-11 self-start px-4" disabled={nameBusy || username.trim() === user.username || !username.trim()}>
          <UserPen size={18} /> {nameBusy ? "Saving…" : "Change username"}
        </button>
        <StatusLine status={nameStatus} />
      </form>

      <form className="flex flex-col gap-2" onSubmit={changePassword}>
        {/* Hidden username so password managers update the right entry. */}
        <input type="text" className="hidden" autoComplete="username" value={user.username} readOnly tabIndex={-1} aria-hidden />
        <label className="flex flex-col gap-2">
          <span className="font-display text-lg">Current password</span>
          <input className="input" type="password" value={current} autoComplete="current-password" onChange={(e) => setCurrent(e.target.value)} />
        </label>
        <label className="flex flex-col gap-2">
          <span className="font-display text-lg">New password</span>
          <input className="input" type="password" value={next} minLength={8} autoComplete="new-password" onChange={(e) => setNext(e.target.value)} />
          <span className="text-sm text-muted">At least 8 characters.</span>
        </label>
        <label className="flex flex-col gap-2">
          <span className="font-display text-lg">Repeat new password</span>
          <input className="input" type="password" value={confirm} minLength={8} autoComplete="new-password" onChange={(e) => setConfirm(e.target.value)} />
        </label>
        <button className="btn-primary min-h-11 self-start px-4" disabled={pwBusy || !current || !next || !confirm}>
          <KeyRound size={18} /> {pwBusy ? "Saving…" : "Change password"}
        </button>
        <StatusLine status={pwStatus} />
      </form>
    </section>
  );
}
