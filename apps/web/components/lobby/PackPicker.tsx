"use client";
import { CUSTOM_PACK_ID, localize } from "@party-game/shared";
import { clientContent } from "@party-game/content";
import { usePacks } from "@/lib/board";
import { Icon } from "../ui";

export function PackPicker({
  value,
  editable,
  customCount,
  onChange,
}: {
  value: string[];
  editable: boolean;
  customCount: number;
  onChange: (packs: string[]) => void;
}) {
  const packs = usePacks();
  if (!packs) return <p className="text-muted">Loading packs…</p>;
  const all = [...packs, { id: CUSTOM_PACK_ID, name: "Custom (your group)", questionCount: customCount, themes: ["custom"] }];
  return (
    <div className="flex flex-wrap gap-2">
      {all.map((p) => {
        const on = value.includes(p.id);
        const theme = clientContent.themes.find((t) => t.id === p.themes[0]);
        const color = theme?.color ?? "#a29cc6";
        return (
          <button
            key={p.id}
            disabled={!editable}
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((x) => x !== p.id) : [...value, p.id])}
            className="flex min-h-11 items-center gap-2 rounded-full border-2 px-3 font-display transition-all disabled:cursor-default"
            style={{ borderColor: color, background: on ? color : "transparent", color: on ? "#14112a" : color, opacity: on ? 1 : 0.6 }}
            title={theme ? localize(theme.description) : undefined}
          >
            {theme && <Icon id={theme.icon} size={16} />}
            {p.name}
            <span className="text-xs opacity-70">{p.questionCount}</span>
          </button>
        );
      })}
    </div>
  );
}
