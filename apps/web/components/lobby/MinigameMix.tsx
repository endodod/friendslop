"use client";
import { localize, type TileFrequency } from "@party-game/shared";
import { clientContent } from "@party-game/content";
import { MINIGAME_CLIENTS } from "@party-game/minigames/client";
import { Icon } from "../ui";

const OPTIONS: { value: TileFrequency; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "few", label: "Few" },
  { value: "normal", label: "Normal" },
  { value: "many", label: "Many" },
];

/** How often each mini-game comes up at the end of a round. "Normal" = default chance. */
export function MinigameMix({
  value,
  editable,
  onChange,
}: {
  value: Record<string, TileFrequency>;
  editable: boolean;
  onChange: (v: Record<string, TileFrequency>) => void;
}) {
  const games = clientContent.minigames.filter((m) => m.enabled && m.id !== "duel" && MINIGAME_CLIENTS[m.id]);
  const set = (id: string, v: TileFrequency) => {
    const next = { ...value };
    if (v === "normal") delete next[id];
    else next[id] = v;
    onChange(next);
  };
  const onCount = games.filter((g) => value[g.id] !== "off").length;
  return (
    <div className="flex flex-col gap-1.5">
      {games.map((m) => {
        const cur = value[m.id] ?? "normal";
        return (
          <div key={m.id} className={`flex flex-wrap items-center justify-between gap-2 ${cur === "off" ? "opacity-60" : ""}`}>
            <span className="flex min-w-0 items-center gap-2" title={localize(m.rules)}>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/20 text-accent">
                <Icon id={m.icon} size={18} />
              </span>
              <span className="truncate font-display">{localize(m.name)}</span>
            </span>
            <div className="flex rounded-xl bg-bg-2 p-0.5" role="radiogroup" aria-label={`${localize(m.name)}: how often`}>
              {OPTIONS.map((o) => (
                <button
                  key={o.value}
                  role="radio"
                  aria-checked={cur === o.value}
                  disabled={!editable || (o.value === "off" && cur !== "off" && onCount <= 1)}
                  onClick={() => set(m.id, o.value)}
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
      <div className="flex items-center justify-between gap-2 pt-1">
        <p className="text-xs text-muted">Many = more likely and can come up twice before every game had a turn. Off = never.</p>
        {editable && Object.keys(value).length > 0 && (
          <button className="btn-ghost min-h-9 shrink-0 px-2 text-sm" onClick={() => onChange({})}>
            Reset
          </button>
        )}
      </div>
    </div>
  );
}
