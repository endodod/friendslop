"use client";
import { PLAYER_AVATARS, colorHex } from "@party-game/shared";
import { photoUrl } from "@/lib/account";

/**
 * Pick a little icon to show instead of your initials. "Aa" = initials.
 * Signed in with a profile picture: the picture is the first option (and the default).
 */
export function AvatarPicker({
  value,
  color,
  name,
  onChange,
  photo,
  usePhoto,
  onUsePhoto,
}: {
  value: string | null | undefined;
  color: string;
  name: string;
  /** Picking an icon/initials also means "don't use my profile picture". */
  onChange: (a: string | null) => void;
  /** Server path of the account's profile picture (shows the extra option). */
  photo?: string | null;
  usePhoto?: boolean;
  onUsePhoto?: () => void;
}) {
  const hex = colorHex(color);
  const initials = (name.trim().slice(0, 2) || "Aa").toUpperCase();
  const options: (string | null)[] = [null, ...PLAYER_AVATARS];
  const src = photoUrl(photo);
  const photoOn = !!src && !!usePhoto;
  return (
    <div className="grid grid-cols-6 gap-1.5 p-1.5 min-[380px]:grid-cols-8 sm:gap-2" role="radiogroup" aria-label="Icon">
      {src && (
        <button
          type="button"
          role="radio"
          aria-checked={photoOn}
          aria-label="Profile picture"
          title="Your profile picture"
          onClick={() => onUsePhoto?.()}
          className="flex aspect-square w-full max-w-11 items-center justify-center justify-self-center overflow-hidden rounded-full transition-transform active:scale-90"
          style={{ boxShadow: photoOn ? `0 0 0 3px #0d0b1a, 0 0 0 6px ${hex}` : "inset 0 0 0 1px #ffffff1a", opacity: photoOn ? 1 : 0.7 }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="" className="h-full w-full object-cover" />
        </button>
      )}
      {options.map((a) => {
        const selected = !photoOn && (value ?? null) === a;
        return (
          <button
            key={a ?? "initials"}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={a ?? "Initials"}
            onClick={() => onChange(a)}
            className="flex aspect-square w-full max-w-11 items-center justify-center justify-self-center rounded-full leading-none transition-transform active:scale-90"
            style={{
              background: selected ? hex : "#ffffff10",
              boxShadow: selected ? `0 0 0 3px #0d0b1a, 0 0 0 6px ${hex}` : "inset 0 0 0 1px #ffffff1a",
              fontSize: a ? "1.35rem" : "0.9rem",
            }}
          >
            {a ?? <span className={`font-display ${selected ? "text-[#14112a]" : "text-muted"}`}>{initials}</span>}
          </button>
        );
      })}
    </div>
  );
}
