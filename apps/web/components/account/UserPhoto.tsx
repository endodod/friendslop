"use client";
import { photoUrl } from "@/lib/account";
import { initials } from "../ui";

/** Account picture (or initials) for places outside a room, where there's no player color. */
export function UserPhoto({
  user,
  size = 40,
  online,
  className = "",
}: {
  user: { username: string; photo: string | null };
  size?: number;
  /** Shows a small green/grey dot. */
  online?: boolean;
  className?: string;
}) {
  const src = photoUrl(user.photo);
  return (
    <span className={`relative inline-flex shrink-0 ${className}`} style={{ width: size, height: size }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" width={size} height={size} className="h-full w-full rounded-full bg-panel-2 object-cover" />
      ) : (
        <span
          className="flex h-full w-full items-center justify-center rounded-full bg-panel-2 font-display text-ink"
          style={{ fontSize: size * 0.4 }}
          aria-hidden
        >
          {initials(user.username)}
        </span>
      )}
      {online !== undefined && (
        <span
          className={`absolute bottom-0 right-0 rounded-full border-2 border-panel ${online ? "bg-good" : "bg-muted/60"}`}
          style={{ width: Math.max(10, size * 0.28), height: Math.max(10, size * 0.28) }}
          aria-label={online ? "online" : "offline"}
          role="img"
        />
      )}
    </span>
  );
}
