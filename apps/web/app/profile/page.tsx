"use client";
import { Camera, LogOut, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AVATAR_SIZE, type PublicUser } from "@party-game/shared";
import { api, loadAccount, resizeImage, signOut, useAccount } from "@/lib/account";
import { AccountSettings } from "@/components/account/AccountSettings";
import { FriendsManager } from "@/components/account/FriendsManager";
import { MyQuestions } from "@/components/account/MyQuestions";
import { StatsGrid } from "@/components/account/StatsGrid";
import { UserPhoto } from "@/components/account/UserPhoto";

export default function ProfilePage() {
  const router = useRouter();
  const user = useAccount((s) => s.user);
  const loaded = useAccount((s) => s.loaded);
  const unavailable = useAccount((s) => s.unavailable);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Fresh stats every time the page opens.
    void loadAccount().then(async () => {
      if (!useAccount.getState().user) return;
      const res = await api<{ user: PublicUser }>("/me");
      if (res.ok) useAccount.getState().setUser(res.user);
    });
  }, []);

  useEffect(() => {
    if (loaded && !user && !unavailable) router.replace("/login");
  }, [loaded, user, unavailable, router]);

  async function upload(file: File) {
    setError(null);
    setBusy(true);
    try {
      const blob = await resizeImage(file, AVATAR_SIZE);
      const res = await api<{ user: PublicUser }>("/me/avatar", { method: "PUT", body: blob, contentType: blob.type });
      if (res.ok) useAccount.getState().setUser(res.user);
      else setError(res.message);
    } catch {
      setError("Couldn't read that image. Try a JPEG or PNG.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removePhoto() {
    setBusy(true);
    const res = await api<{ user: PublicUser }>("/me/avatar", { method: "DELETE" });
    setBusy(false);
    if (res.ok) useAccount.getState().setUser(res.user);
  }

  if (unavailable)
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="font-display text-3xl">Accounts are unavailable right now</p>
        <p className="text-muted">The game server has no database connected. You can still play as a guest.</p>
        <Link href="/" className="btn-primary">Back</Link>
      </main>
    );
  if (!user)
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <p className="animate-pulse font-display text-3xl">Loading…</p>
      </main>
    );

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-4 py-6">
      <header className="flex items-center justify-between">
        <Link href="/" className="btn-ghost min-h-11 px-2">← Play</Link>
        <button
          className="btn-ghost min-h-11 px-3"
          onClick={async () => {
            await signOut();
            router.replace("/");
          }}
        >
          <LogOut size={18} /> Sign out
        </button>
      </header>

      <section className="card flex flex-col items-center gap-3 p-5 text-center">
        <button
          className="group relative rounded-full focus-visible:outline-4 focus-visible:outline-accent"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          aria-label="Upload a profile picture"
        >
          <UserPhoto user={user} size={128} className={busy ? "animate-pulse" : ""} />
          <span className="absolute bottom-1 right-1 flex h-10 w-10 items-center justify-center rounded-full bg-accent text-[#241a00] shadow-lg">
            <Camera size={20} />
          </span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
          }}
        />
        <h1 className="font-display text-4xl">{user.username}</h1>
        <p className="text-sm text-muted">Playing since {new Date(user.createdAt).toLocaleDateString()}</p>
        {user.photo && (
          <button className="btn-ghost min-h-10 text-sm" disabled={busy} onClick={removePhoto}>
            <Trash2 size={16} /> Remove picture
          </button>
        )}
        {error && (
          <p className="font-semibold text-bad" role="alert">
            {error}
          </p>
        )}
        <p className="text-xs text-muted">Your picture replaces your icon in games you join while signed in.</p>
      </section>

      <section className="card flex flex-col gap-3 p-5">
        <h2 className="font-display text-2xl">Stats</h2>
        <StatsGrid stats={user.stats} />
      </section>

      <FriendsManager />

      <MyQuestions />

      <AccountSettings user={user} />
    </main>
  );
}
