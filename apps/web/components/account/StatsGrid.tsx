import { GAMES, type UserStats } from "@party-game/shared";
import { Icon } from "../ui";

export function StatsGrid({ stats }: { stats: UserStats }) {
  const winRate = stats.gamesPlayed ? Math.round((stats.gamesWon / stats.gamesPlayed) * 100) : null;
  const items = [
    { icon: "cards", label: "Games played", value: stats.gamesPlayed, color: "text-info" },
    { icon: "trophy", label: "Games won", value: stats.gamesWon, sub: winRate === null ? undefined : `${winRate}% win rate`, color: "text-accent" },
    { icon: "star", label: "Stars collected", value: stats.starsCollected, color: "text-[#ffe066]" },
  ];
  const byGame = GAMES.map((g) => ({ g, s: stats.byGame?.[g.id] })).filter((x) => x.s && x.s.played > 0);
  return (
    <div className="flex flex-col gap-3">
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
    {byGame.length > 0 && (
      <ul className="flex flex-col gap-2" aria-label="Per game">
        {byGame.map(({ g, s }) => (
          <li key={g.id} className="flex items-center gap-3 rounded-2xl bg-bg-2 p-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[#14112a]" style={{ background: g.color }}>
              <Icon id={g.icon} size={22} />
            </span>
            <span className="min-w-0 flex-1 truncate font-display">{g.name}</span>
            <span className="shrink-0 whitespace-nowrap text-sm text-muted">
              <span className="font-display text-ink">{s!.won}</span> won / {s!.played} played
            </span>
          </li>
        ))}
      </ul>
    )}
    </div>
  );
}
