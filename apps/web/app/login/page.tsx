"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BRANDING } from "@party-game/shared";
import { signIn, useAccount } from "@/lib/account";

export default function LoginPage() {
  const router = useRouter();
  const user = useAccount((s) => s.user);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) router.replace("/profile");
  }, [user, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const err = await signIn(mode, username.trim(), password);
    setBusy(false);
    if (err) setError(err);
    else router.replace("/profile");
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-5 px-4 py-8">
      <h1 className="text-center font-display text-4xl text-accent">{BRANDING.name}</h1>
      <div className="flex rounded-2xl bg-bg-2 p-1" role="tablist">
        {(["login", "register"] as const).map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            onClick={() => {
              setMode(m);
              setError(null);
            }}
            className={`min-h-11 flex-1 rounded-xl font-display text-lg ${mode === m ? "bg-accent text-[#241a00]" : "text-muted"}`}
          >
            {m === "login" ? "Sign in" : "Create account"}
          </button>
        ))}
      </div>
      <form className="card flex flex-col gap-4 p-5" onSubmit={submit}>
        <label className="flex flex-col gap-2">
          <span className="font-display text-lg">Username</span>
          <input
            className="input"
            value={username}
            maxLength={20}
            autoComplete="username"
            autoCapitalize="none"
            autoFocus
            onChange={(e) => setUsername(e.target.value)}
          />
          {mode === "register" && <span className="text-sm text-muted">3–20 letters, numbers or underscores. Friends find you by it.</span>}
        </label>
        <label className="flex flex-col gap-2">
          <span className="font-display text-lg">Password</span>
          <input
            className="input"
            type="password"
            value={password}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            minLength={mode === "register" ? 8 : undefined}
            onChange={(e) => setPassword(e.target.value)}
          />
          {mode === "register" && <span className="text-sm text-muted">At least 8 characters.</span>}
        </label>
        <button className="btn-primary" disabled={busy || !username.trim() || !password}>
          {mode === "login" ? "Sign in" : "Create account"}
        </button>
        {error && (
          <p className="text-center font-semibold text-bad" role="alert">
            {error}
          </p>
        )}
      </form>
      <p className="text-center text-sm text-muted">
        No account needed to play. Signing in adds friends, invites, a profile picture and stats.
      </p>
      <Link href="/" className="btn-ghost">
        Back
      </Link>
    </main>
  );
}
