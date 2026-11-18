"use client";
import { LogIn } from "lucide-react";
import Link from "next/link";
import { useAccount } from "@/lib/account";
import { UserPhoto } from "./UserPhoto";

/** "Sign in" button, or the signed-in user's picture + name linking to their profile. */
export function AccountChip() {
  const user = useAccount((s) => s.user);
  const loaded = useAccount((s) => s.loaded);
  const incoming = useAccount((s) => s.friends.filter((f) => f.status === "incoming").length);
  if (!loaded) return <span className="h-11" aria-hidden />;
  if (!user)
    return (
      <Link href="/login" className="btn-secondary min-h-11 px-4 text-base">
        <LogIn size={18} /> Sign in
      </Link>
    );
  return (
    <Link href="/profile" className="btn-secondary relative min-h-11 gap-2 py-1 pl-1.5 pr-4 text-base" aria-label="Your profile">
      <UserPhoto user={user} size={34} />
      <span className="max-w-[10rem] truncate">{user.username}</span>
      {incoming > 0 && (
        <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-bad px-1 text-xs text-white">
          {incoming}
        </span>
      )}
    </Link>
  );
}
