import type { UserStats } from "@party-game/shared";
import { Icon } from "../ui";

export function StatsGrid({ stats }: { stats: UserStats }) {
  const winRate = stats.gamesPlayed ? Math.round((stats.gamesWon / stats.gamesPlayed) * 100) : null;
  const items = [
    { icon: "cards", label: "Games played", value: stats.gamesPlayed, color: "text-info" },
    { icon: "trophy", label: "Games won", value: stats.gamesWon, sub: winRate === null ? undefined : `${winRate}% win rate`, color: "text-accent" },
    { icon: "star", label: "Stars collected", value: stats.starsCollected, color: "text-[#ffe066]" },
  ];
  return (
    <dl className="grid grid-cols-3 gap-2">
      {items.map((it) => (
        <div key={it.label} className="flex flex-col items-center gap-1 rounded-2xl bg-bg-2 p-3 text-center">
          <Icon id={it.icon} size={26} className={it.color} />
          <dd className="font-display text-3xl tabular-nums">{it.value}</dd>
          <dt className="text-xs text-muted sm:text-sm">{it.label}</dt>
          {it.sub && <span className="text-xs text-muted">{it.sub}</span>}
        </div>
      ))}
    </dl>
  );
}
