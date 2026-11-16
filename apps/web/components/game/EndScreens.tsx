"use client";
import { motion } from "framer-motion";
import { Home, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { localize, standings, type PlayerStats, type PublicGameState } from "@party-game/shared";
import { clientContent } from "@party-game/content";
import { act } from "@/lib/useRoom";
import { Avatar, CoinCount, Icon, PlayerName, StarCount, useIsHost, usePlayers } from "../ui";
import { Confetti } from "../fx";
import { SkipButton } from "./PhasePanel";

export function GameEndBanner() {
  return (
    <div className="flex flex-col items-center gap-4 py-10 text-center">
      <motion.h2
        initial={{ scale: 3, opacity: 0, rotate: -10 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 120 }}
        className="font-display text-6xl text-accent"
      >
        Game over!
      </motion.h2>
      <p className="font-display text-2xl">But wait… bonus stars!</p>
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
                    a.playerIds.map((pid) => (
                      <span key={pid} className="flex items-center gap-1">
                        <Avatar player={players[pid]} size={40} ring />
                        <StarCount value={1} />
                      </span>
                    ))
                  )}
                </motion.div>
              ) : (
                <span className="font-display text-4xl text-muted">?</span>
              )}
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}

/** Pick the most entertaining stat for a player. */
function funniestStat(s: PlayerStats): string {
  const cands: [number, string][] = [
    [s.dataSelfWrong * 5, `Was wrong about their own data ${s.dataSelfWrong}×`],
    [s.redTiles * 2, `Landed on ${s.redTiles} red tiles`],
    [s.stolenFrom * 4, `Got robbed ${s.stolenFrom}×`],
    [s.steals * 4, `Stole ${s.steals}×`],
    [s.perfectMatches * 4, `${s.perfectMatches} perfect guesses`],
    [s.coinsLost, `Lost ${s.coinsLost} coins along the way`],
    [s.timesTarget > 0 && s.matchedAsTarget === 0 ? 10 : 0, "Nobody could read them. Ever."],
    [s.stepsMoved / 4, `Walked ${s.stepsMoved} spaces`],
  ];
  cands.sort((a, b) => b[0] - a[0]);
  return cands[0][0] > 0 ? cands[0][1] : "Played it cool";
}

export function Podium({ game }: { game: PublicGameState }) {
  const players = usePlayers();
  const isHost = useIsHost();
  const router = useRouter();
  const ranking = standings(game as never);
  const top = ranking.slice(0, 3);
  const heights = [180, 130, 100];
  const order = [1, 0, 2].filter((i) => top[i]);
  const winner = players[ranking[0]?.playerId];

  return (
    <div className="flex flex-col gap-6" data-testid="podium">
      <Confetti fireKey="podium" count={90} />
      <h2 className="text-center font-display text-5xl">
        <PlayerName player={winner} /> wins!
      </h2>
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
                className="flex w-full flex-col items-center justify-start gap-1 rounded-t-2xl bg-panel-2 pt-3"
                style={{ height: heights[i] }}
              >
                <span className="font-display text-4xl text-accent">{r.rank}</span>
                <StarCount value={gp.stars} />
                <CoinCount value={gp.coins} size={16} />
              </div>
            </motion.div>
          );
        })}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {ranking.map(({ playerId, rank }) => {
          const p = players[playerId];
          const s = game.players[playerId].stats;
          return (
            <div key={playerId} className="card flex flex-col gap-2 p-4">
              <div className="flex items-center gap-2">
                <span className="font-display text-xl text-muted">#{rank}</span>
                <Avatar player={p} size={32} />
                <PlayerName player={p} className="text-xl" />
              </div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                <dt className="text-muted">Matches</dt>
                <dd className="font-semibold">{s.matchesMade}/{s.guesses}</dd>
                <dt className="text-muted">Read by others</dt>
                <dd className="font-semibold">{s.matchedAsTarget}</dd>
                <dt className="text-muted">Coins earned</dt>
                <dd className="font-semibold">{s.coinsEarned}</dd>
                <dt className="text-muted">Mini-game wins</dt>
                <dd className="font-semibold">{s.minigameWins}</dd>
                <dt className="text-muted">Steals</dt>
                <dd className="font-semibold">{s.steals}</dd>
              </dl>
              <p className="rounded-xl bg-bg-2 px-3 py-2 font-display text-accent">{funniestStat(s)}</p>
            </div>
          );
        })}
      </div>

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
