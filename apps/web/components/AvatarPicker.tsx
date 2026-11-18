"use client";
import { PLAYER_AVATARS, colorHex } from "@party-game/shared";

/** Pick a little icon to show instead of your initials. "Aa" = initials. */
export function AvatarPicker({
  value,
  color,
  name,
  onChange,
}: {
  value: string | null | undefined;
  color: string;
  name: string;
  onChange: (a: string | null) => void;
}) {
  const hex = colorHex(color);
  const initials = (name.trim().slice(0, 2) || "Aa").toUpperCase();
  const options: (string | null)[] = [null, ...PLAYER_AVATARS];
  return (
    <div className="grid grid-cols-8 gap-1.5 p-1.5 sm:gap-2" role="radiogroup" aria-label="Icon">
      {options.map((a) => {
        const selected = (value ?? null) === a;
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
