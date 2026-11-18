"use client";
import { motion } from "framer-motion";
import { Home, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ACHIEVEMENTS, computeAchievements, evaluateBonusStar, localize, standings, type PlayerStats, type PublicGameState } from "@party-game/shared";
import { clientContent } from "@party-game/content";
import { act } from "@/lib/useRoom";
import { useStore } from "@/lib/store";
import { useRemaining } from "@/lib/time";
import { Avatar, CoinCount, Icon, PlayerName, StarCount, useIsHost, usePlayers } from "../ui";
import { Confetti } from "../fx";
import { SkipButton } from "./PhasePanel";

export function GameEndBanner() {
  const g = useStore((s) => s.pub?.game);
  const goal = useStore((s) => s.pub?.settings.starGoal ?? 0);
  const players = usePlayers();
  const winner = g?.starGoalWinner ? players[g.starGoalWinner] : null;
  return (
    <div className="flex flex-col items-center gap-4 py-10 text-center">
      <motion.h2
        initial={{ scale: 3, opacity: 0, rotate: -10 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 120 }}
        className="font-display text-6xl text-accent"
      >
        {winner ? "Star race over!" : "Game over!"}
      </motion.h2>
      {winner ? (
        <p className="flex items-center gap-2 font-display text-2xl">
          <Avatar player={winner} size={40} ring /> <PlayerName player={winner} /> reached {goal}{" "}
          <Icon id="star" size={26} className="text-[#ffe066]" />!
        </p>
      ) : (
        <p className="font-display text-2xl">But wait… bonus stars!</p>
      )}
      <SkipButton />
    </div>
  );
}

export function BonusStarsView({ game }: { game: PublicGameState }) {
  const players = usePlayers();
  const bs = game.bonusStars;
  if (!bs) return null;
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-center font-display text-4xl text-accent">Bonus stars</h2>
      <ul className="flex flex-col gap-3">
        {bs.awards.map((a, i) => {
          const def = clientContent.bonusStars.find((b) => b.id === a.bonusStarId);
          const shown = i < bs.revealed;
          return (
            <motion.li
              key={a.bonusStarId}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.15 }}
              className="card flex items-center gap-4 p-4"
            >
              <Icon id={def?.icon ?? "star"} size={48} className="text-[#ffe066]" />
              <div className="min-w-0 flex-1">
                <p className="font-display text-2xl">{def ? localize(def.name) : a.bonusStarId}</p>
                <p className="text-muted">{def ? localize(def.description) : ""}</p>
              </div>
              {shown ? (
                <motion.div
                  initial={{ scale: 0, rotate: 180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 200, damping: 12 }}
                  className="flex flex-wrap items-center justify-end gap-2"
                >
                  {a.playerIds.length === 0 ? (
                    <span className="text-muted">Nobody!</span>
                  ) : (
                    <>
                      {a.playerIds.map((pid) => (
                        <span key={pid} className="flex items-center gap-1">
                          <Avatar player={players[pid]} size={40} ring />
                          <StarCount value={1} />
                        </span>
                      ))}
                      <span className="w-full text-right text-sm text-muted">{awardValue(a.bonusStarId, a.value)}</span>
                    </>
                  )}
                </motion.div>
              ) : (
                <span className="font-display text-4xl text-muted">?</span>
              )}
            </motion.li>
          );
        })}
      </ul>
      {bs.revealed >= bs.awards.length && <FinalStandingsTeaser game={game} />}
    </div>
  );
}

/** Shown once every bonus star is out: the new star totals, then the results page after a pause. */
function FinalStandingsTeaser({ game }: { game: PublicGameState }) {
  const players = usePlayers();
  const isHost = useIsHost();
  const left = useRemaining(game.phaseEndsAt, 250);
  const ranking = standings(game as never);
  return (
    <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }} className="card flex flex-col gap-3 p-4">
      <h3 className="text-center font-display text-2xl">Final standings</h3>
      <ol className="flex flex-col gap-1.5">
        {ranking.map(({ playerId, rank }) => (
          <li key={playerId} className="flex items-center gap-3 rounded-2xl bg-bg-2 px-3 py-1.5">
            <span className="w-6 text-center font-display text-xl text-accent">{rank}</span>
            <Avatar player={players[playerId]} size={32} />
            <span className="min-w-0 flex-1 truncate font-display">{players[playerId]?.name}</span>
            <StarCount value={game.players[playerId].stars} />
            <CoinCount value={game.players[playerId].coins} size={16} />
          </li>
        ))}
      </ol>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-muted">Full results in {Math.max(0, Math.ceil(left / 1000))}s</span>
        {isHost && (
          <button className="btn-primary min-h-11 text-base" onClick={() => act("game:continue", {})} data-testid="show-results">
            Show final results
          </button>
        )}
      </div>
    </motion.section>
  );
}

/** "75%" for rate awards, the plain number otherwise. */
function awardValue(id: string, value: number): string {
  const def = clientContent.bonusStars.find((b) => b.id === id);
  if (def?.per === "timesTarget") return `${value.toFixed(1)} matches per question`;
  return def?.per ? `${Math.round(value * 100)}%` : String(value);
}

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null);

/** Pick the most entertaining stat for a player. */
function funniestStat(s: PlayerStats): string {
  const cands: [number, string][] = [
    [s.dataSelfWrong * 5, `Was wrong about their own data ${s.dataSelfWrong}×`],
    [s.redTiles * 2, `Landed on ${s.redTiles} red tiles`],
    [s.stolenFrom * 4, `Got robbed ${s.stolenFrom}×`],
    [s.steals * 4, `Stole ${s.steals}×`],
    [s.perfectMatches * 4, `${s.perfectMatches} perfect guesses`],
    [s.coinsLost / 4, `Spent or lost ${s.coinsLost} coins`],
    [s.timesTarget > 0 && s.matchedAsTarget === 0 ? 10 : 0, "Nobody could read them. Ever."],
    [s.stepsMoved / 4, `Walked ${s.stepsMoved} spaces`],
  ];
  cands.sort((a, b) => b[0] - a[0]);
  return cands[0][0] > 0 ? cands[0][1] : "Played it cool";
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="font-display text-2xl">{title}</h3>
      {children}
    </section>
  );
}

/**
 * Highlights: who led each category. It's the same pool the bonus stars are drawn from; the
 * categories that handed out a star this game come first, marked +1 ★.
 */
function Highlights({ game }: { game: PublicGameState }) {
  const players = usePlayers();
  const starred = new Set((game.bonusStars?.awards ?? []).map((a) => a.bonusStarId));
  const rows = clientContent.bonusStars
    .map((def) => ({ def, r: evaluateBonusStar(game as never, def) }))
    .filter((x) => x.r.playerIds.length > 0)
    .sort((a, b) => Number(starred.has(b.def.id)) - Number(starred.has(a.def.id)));
  if (!rows.length) return <p className="text-muted">Nothing to brag about this time.</p>;
  return (
    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {rows.map(({ def, r }, i) => {
        const star = starred.has(def.id);
        return (
          <motion.li
            key={def.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.6 + i * 0.06 }}
            className={`flex items-center gap-3 rounded-2xl p-3 ${star ? "bg-[#ffe066]/10 ring-1 ring-[#ffe066]/40" : "bg-bg-2"}`}
          >
            <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${star ? "bg-[#ffe066]/20 text-[#ffe066]" : "bg-accent/15 text-accent"}`}>
              <Icon id={def.icon} size={26} />
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="font-display">
                {localize(def.name)}
                {star && <span className="ml-2 text-sm text-[#ffe066]">+1 ★</span>}
              </p>
              <p className="text-xs text-muted">{localize(def.description)}</p>
              <p className="text-sm text-muted">{awardValue(def.id, r.value)}</p>
            </div>
            <span className="flex -space-x-2">
              {r.playerIds.map((id) => (
                <Avatar key={id} player={players[id]} size={34} ring={star} />
              ))}
            </span>
          </motion.li>
        );
      })}
    </ul>
  );
}

function Stat({ label, value, sub, bar }: { label: string; value: React.ReactNode; sub?: string; bar?: number | null }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl bg-bg-2 px-3 py-2">
      <span className="text-xs text-muted">{label}</span>
      <span className="font-display text-xl leading-none">
        {value}
        {sub && <span className="ml-1 text-sm text-muted">{sub}</span>}
      </span>
      {bar !== undefined && bar !== null && (
        <span className="h-1.5 overflow-hidden rounded-full bg-black/40">
          <span className="block h-full rounded-full bg-accent" style={{ width: `${bar}%` }} />
        </span>
      )}
    </div>
  );
}

function PlayerCard({ game, playerId, rank, achievements, awards }: { game: PublicGameState; playerId: string; rank: number; achievements: string[]; awards: string[] }) {
  const players = usePlayers();
  const p = players[playerId];
  const gp = game.players[playerId];
  const s = gp.stats;
  const qRate = pct(s.matchesMade, s.guesses);
  const mgRate = pct(s.minigameWins, s.minigamesPlayed);
  const readRate = pct(s.matchedAsTarget, s.timesTarget * Math.max(1, Object.keys(game.players).length - 1));
  return (
    <div className="card flex flex-col gap-3 p-4">
      <div className="flex items-center gap-2">
        <span className="w-9 font-display text-2xl text-muted">#{rank}</span>
        <Avatar player={p} size={40} ring={rank === 1} />
        <PlayerName player={p} className="min-w-0 flex-1 truncate text-xl" />
        <StarCount value={gp.stars} />
        <CoinCount value={gp.coins} size={16} />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat label="Question match rate" value={qRate === null ? "–" : `${qRate}%`} sub={`${s.matchesMade}/${s.guesses}`} bar={qRate} />
        <Stat label="Perfect guesses" value={s.perfectMatches} />
        <Stat label="Read by others" value={readRate === null ? "–" : `${readRate}%`} sub={`${s.matchedAsTarget} matches`} bar={readRate} />
        <Stat label="Mini-games won" value={`${s.minigameWins}/${s.minigamesPlayed}`} bar={mgRate} />
        <Stat label="Coins earned / spent" value={s.coinsEarned} sub={s.coinsLost ? `−${s.coinsLost}` : undefined} />
        <Stat label="Stars bought" value={s.starsBought} sub={awards.length ? `+${awards.length} bonus` : undefined} />
        <Stat label="Steals" value={s.steals} sub={s.stolenFrom ? `robbed ${s.stolenFrom}×` : undefined} />
        <Stat label="Items used" value={s.itemsUsed} />
        <Stat label="Spaces walked" value={s.stepsMoved} />
      </div>
      {awards.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {awards.map((id) => {
            const def = clientContent.bonusStars.find((b) => b.id === id);
            return (
              <span key={id} className="inline-flex items-center gap-1 rounded-full bg-[#ffe066]/15 px-2 py-1 font-display text-sm text-[#ffe066] ring-1 ring-[#ffe066]/60">
                <Icon id="star" size={14} /> {def ? localize(def.name) : id}
              </span>
            );
          })}
        </div>
      )}
      {achievements.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" aria-label={`${p?.name}'s achievements`}>
          {achievements.map((id) => {
            const a = ACHIEVEMENTS.find((x) => x.id === id)!;
            return (
              <li
                key={id}
                title={a.description}
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-display text-sm"
                style={{ background: `${a.color}22`, color: a.color, boxShadow: `inset 0 0 0 1.5px ${a.color}88` }}
              >
                <Icon id={a.icon} size={15} /> {a.name}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted">No achievements this time.</p>
      )}
      <p className="rounded-xl bg-bg-2 px-3 py-2 font-display text-accent">{funniestStat(s)}</p>
    </div>
  );
}

/** Every achievement with who earned it (unearned ones dimmed). */
function AchievementBoard({ earned }: { earned: Record<string, string[]> }) {
  const players = usePlayers();
  return (
    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {ACHIEVEMENTS.map((a) => {
        const who = Object.entries(earned).filter(([, ids]) => ids.includes(a.id)).map(([pid]) => pid);
        return (
          <li key={a.id} className={`flex items-center gap-3 rounded-2xl bg-bg-2 p-2.5 ${who.length ? "" : "opacity-40"}`}>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: `${a.color}22`, color: a.color }}>
              <Icon id={a.icon} size={22} />
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block font-display">{a.name}</span>
              <span className="block text-xs text-muted">{a.description}</span>
            </span>
            <span className="flex -space-x-2">
              {who.map((pid) => (
                <Avatar key={pid} player={players[pid]} size={28} />
              ))}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function Podium({ game }: { game: PublicGameState }) {
  const players = usePlayers();
  const isHost = useIsHost();
  const router = useRouter();
  const ranking = standings(game as never);
  const top = ranking.slice(0, 3);
  const heights = [190, 152, 126];
  const order = [1, 0, 2].filter((i) => top[i]);
  const winner = players[ranking[0]?.playerId];
  const achievements = computeAchievements(game as never);
  const awardsOf = (pid: string) => (game.bonusStars?.awards ?? []).filter((a) => a.playerIds.includes(pid)).map((a) => a.bonusStarId);
  const [tab, setTab] = useState<"players" | "achievements">("players");

  return (
    <div className="flex flex-col gap-8" data-testid="podium">
      <Confetti fireKey="podium" count={90} />
      <div className="text-center">
        <p className="font-display text-xl text-muted">Game finished</p>
        <h2 className="font-display text-5xl">
          <PlayerName player={winner} /> wins!
        </h2>
      </div>
      <div className="flex items-end justify-center gap-3">
        {order.map((i) => {
          const r = top[i];
          const p = players[r.playerId];
          const gp = game.players[r.playerId];
          return (
            <motion.div
              key={r.playerId}
              initial={{ y: 200, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.4 + (2 - i) * 0.4, type: "spring", stiffness: 90 }}
              className="flex w-28 flex-col items-center gap-2"
            >
              {i === 0 && <Icon id="crown" size={44} className="text-accent" />}
              <Avatar player={p} size={i === 0 ? 76 : 60} ring={i === 0} />
              <span className="font-display text-lg">{p?.name}</span>
              <div
                className="flex w-full flex-col items-center justify-start gap-1 rounded-t-2xl pt-3"
                style={{
                  height: heights[i],
                  background: i === 0 ? "linear-gradient(180deg, #ffc93355, #2a2549)" : "linear-gradient(180deg, #3a3462, #2a2549)",
                  boxShadow: i === 0 ? "inset 0 0 0 2px #ffc93388" : undefined,
                }}
              >
                <span className="font-display text-4xl text-accent">{r.rank}</span>
                <StarCount value={gp.stars} />
                <CoinCount value={gp.coins} size={16} />
              </div>
            </motion.div>
          );
        })}
      </div>

      <Section title="Highlights">
        <Highlights game={game} />
      </Section>

      <section className="flex flex-col gap-3">
        <div className="flex gap-2" role="tablist">
          {(["players", "achievements"] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`rounded-full px-4 py-1.5 font-display ${tab === t ? "bg-accent text-[#241a00]" : "bg-bg-2 text-muted"}`}
            >
              {t === "players" ? "Player stats" : "Achievements"}
            </button>
          ))}
        </div>
        {tab === "players" ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {ranking.map(({ playerId, rank }) => (
              <PlayerCard key={playerId} game={game} playerId={playerId} rank={rank} achievements={achievements[playerId] ?? []} awards={awardsOf(playerId)} />
            ))}
          </div>
        ) : (
          <AchievementBoard earned={achievements} />
        )}
      </section>

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
        {isHost && (
          <>
            <button className="btn-primary min-h-14 text-xl" onClick={() => act("game:playAgain", {})}>
              <RotateCcw /> Play again (same players)
            </button>
            <button className="btn-secondary" onClick={() => act("game:abort", {})}>
              Back to lobby
            </button>
          </>
        )}
        <button className="btn-ghost" onClick={() => router.push("/")}>
          <Home size={18} /> Home
        </button>
      </div>
    </div>
  );
}
