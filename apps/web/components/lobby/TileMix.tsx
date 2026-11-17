"use client";
import { GAME_CONFIG, localize, type TileFrequency } from "@party-game/shared";
import { clientContent } from "@party-game/content";
import { Icon } from "../ui";

const OPTIONS: { value: TileFrequency; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "few", label: "Few" },
  { value: "normal", label: "Normal" },
  { value: "many", label: "Many" },
];

/** How often each tile type appears. "Normal" = as the map was designed. */
export function TileMix({
  value,
  editable,
  onChange,
}: {
  value: Record<string, TileFrequency>;
  editable: boolean;
  onChange: (v: Record<string, TileFrequency>) => void;
}) {
  const tiles = clientContent.tiles.filter((t) => !GAME_CONFIG.tiles.notTunable.includes(t.id));
  return (
    <div className="flex flex-col gap-1.5">
      {tiles.map((t) => {
        const cur = value[t.id] ?? "normal";
        return (
          <div key={t.id} className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ background: t.color }}>
                <Icon id={t.icon} size={18} className="text-[#14112a]" />
              </span>
              <span className="truncate font-display">{localize(t.name)}</span>
            </span>
            <div className="flex rounded-xl bg-bg-2 p-0.5" role="radiogroup" aria-label={`${localize(t.name)} tiles`}>
              {OPTIONS.map((o) => (
                <button
                  key={o.value}
                  role="radio"
                  aria-checked={cur === o.value}
                  disabled={!editable}
                  onClick={() => {
                    const next = { ...value };
                    if (o.value === "normal") delete next[t.id];
                    else next[t.id] = o.value;
                    onChange(next);
                  }}
                  className={`min-h-11 min-w-12 rounded-lg px-2 text-sm font-semibold transition-colors disabled:cursor-default ${
                    cur === o.value ? (o.value === "off" ? "bg-bad text-white" : "bg-accent text-[#241a00]") : "text-muted"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        );
      })}
      <p className="text-xs text-muted">Extra tiles replace blue ones; removed tiles become blue. The map always keeps a few blue tiles for the star.</p>
    </div>
  );
}
