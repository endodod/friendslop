"use client";
import { Check } from "lucide-react";
import { PLAYER_COLORS } from "@party-game/shared";

export function ColorPicker({ value, taken = [], onChange }: { value?: string; taken?: string[]; onChange: (c: string) => void }) {
  return (
    <div className="grid grid-cols-8 gap-1 p-1 min-[380px]:gap-1.5 min-[380px]:p-1.5 sm:gap-2" role="radiogroup" aria-label="Color">
      {PLAYER_COLORS.map((c) => {
        const isTaken = taken.includes(c.id) && c.id !== value;
        const selected = value === c.id;
        return (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={`${c.name}${isTaken ? " (taken)" : ""}`}
            disabled={isTaken}
            onClick={() => onChange(c.id)}
            className="aspect-square w-full max-w-11 justify-self-center rounded-full flex items-center justify-center transition-transform active:scale-90 disabled:opacity-20"
            style={{ background: c.hex, boxShadow: selected ? `0 0 0 3px #0d0b1a, 0 0 0 6px ${c.hex}` : undefined }}
          >
            {selected && <Check className="text-[#14112a]" size={18} strokeWidth={3} />}
            {isTaken && <span className="text-[#14112a] font-bold">×</span>}
          </button>
        );
      })}
    </div>
  );
}
