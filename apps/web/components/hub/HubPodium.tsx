"use client";
import { motion } from "framer-motion";
import { Home, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { TEAM_INFO, gameInfo, type HubResults } from "@party-game/shared";
import { act } from "@/lib/useRoom";
import { Avatar, Icon, PlayerName, useIsHost, usePlayers } from "../ui";
import { Confetti } from "../fx";
import { useHub } from "./common";

function TeamsPodium({ r }: { r: HubResults }) {
  const players = usePlayers();
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {[...(r.teams ?? [])]
        .sort((a, b) => Number(b.won) - Number(a.won))
        .map((t, i) => (
          <motion.div
            key={t.id}
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3 + i * 0.3, type: "spring", stiffness: 90 }}
            className="flex flex-col items-center gap-3 rounded-3xl p-5"
            style={{
              background: `linear-gradient(180deg, ${TEAM_INFO[t.id].color}${t.won ? "55" : "22"}, #2a2549)`,
              boxShadow: t.won ? `inset 0 0 0 3px ${TEAM_INFO[t.id].color}` : undefined,
            }}
          >
            {t.won && <Icon id="crown" size={40} className="text-accent" />}
            <span className="font-display text-3xl">
              {TEAM_INFO[t.id].emoji} {t.name}
            </span>
            <span className="text-muted">{t.score} agents found</span>
            <div className="flex flex-wrap justify-center gap-2">
              {t.players.map((p) => (
                <span key={p} className="flex items-center gap-1.5 rounded-full bg-bg-2 py-0.5 pl-0.5 pr-2.5">
                  <Avatar player={players[p]} size={28} ring={t.won} />
                  <span className="font-display text-sm">{players[p]?.name}</span>
                </span>
              ))}
            </div>
          </motion.div>
        ))}
    </div>
  );
}

function TopThree({ r }: { r: HubResults }) {
  const players = usePlayers();
  const top = r.ranking.slice(0, 3);
  const heights = [170, 136, 112];
  const order = [1, 0, 2].filter((i) => top[i]);
  return (
    <div className="flex items-end justify-center gap-3">
      {order.map((i) => {
        const e = top[i];
        const p = players[e.playerId];
        return (
          <motion.div
            key={e.playerId}
            initial={{ y: 200, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4 + (2 - i) * 0.4, type: "spring", stiffness: 90 }}
            className="flex w-[31%] min-w-0 max-w-28 flex-col items-center gap-2"
          >
            {e.rank === 1 && <Icon id="crown" size={44} className="text-accent" />}
            <Avatar player={p} size={i === 0 ? 76 : 60} ring={i === 0} />
            <span className="w-full truncate text-center font-display text-base sm:text-lg" title={p?.name}>
              {p?.name}
            </span>
            <div
              className="flex w-full flex-col items-center justify-start gap-1 rounded-t-2xl pt-3"
              style={{
                height: heights[i],
                background: i === 0 ? "linear-gradient(180deg, #ffc93355, #2a2549)" : "linear-gradient(180deg, #3a3462, #2a2549)",
                boxShadow: i === 0 ? "inset 0 0 0 2px #ffc93388" : undefined,
              }}
            >
              <span className="font-display text-4xl text-accent">{e.rank}</span>
              <span className="font-display text-xl">{e.score}</span>
              <span className="text-xs text-muted">{r.scoreLabel}</span>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

export function HubPodium() {
  const hub = useHub();
  const players = usePlayers();
  const isHost = useIsHost();
  const router = useRouter();
  const r = hub.results;
  const info = gameInfo(hub.gameId);
  if (!r) return null;
  return (
    <div className="flex flex-col gap-8" data-testid="hub-podium">
      <Confetti fireKey={`podium-${hub.matchId}`} count={90} />
      <div className="text-center">
        <p className="font-display text-xl text-muted">{info.name} · game finished</p>
        <h2 className="font-display text-4xl sm:text-5xl" style={{ color: info.color }}>
          {r.headline}
        </h2>
        {r.teams && <p className="mt-1 text-muted">{r.scoreLabel}</p>}
      </div>

      {r.teams ? <TeamsPodium r={r} /> : <TopThree r={r} />}

      {r.highlights.length > 0 && (
        <section className="flex flex-col gap-3">
          <h3 className="font-display text-2xl">Highlights</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {r.highlights.map((h, i) => (
              <motion.div
                key={h.title}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1 + i * 0.15 }}
                className="flex items-center gap-3 rounded-2xl bg-bg-2 p-3"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[#14112a]" style={{ background: info.color }}>
                  <Icon id={h.icon} size={26} />
                </span>
                <div className="flex min-w-0 flex-col">
                  <span className="font-display text-lg leading-tight">{h.title}</span>
                  <span className="flex flex-wrap items-center gap-1 text-sm text-muted">
                    {h.playerIds.map((p) => (
                      <PlayerName key={p} player={players[p]} />
                    ))}
                    <span>{h.text}</span>
                  </span>
                </div>
              </motion.div>
            ))}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h3 className="font-display text-2xl">Player stats</h3>
        <div className="grid gap-3 lg:grid-cols-2">
          {r.ranking.map((e) => (
            <div key={e.playerId} className="flex flex-col gap-2 rounded-2xl bg-bg-2 p-3" data-testid="hub-player-card">
              <div className="flex items-center gap-2">
                <span className="w-6 text-center font-display text-xl text-accent">{e.rank}</span>
                <Avatar player={players[e.playerId]} size={34} />
                <PlayerName player={players[e.playerId]} className="min-w-0 flex-1 truncate text-lg" />
                {!r.teams && (
                  <span className="font-display text-xl">
                    {e.score} <span className="text-sm text-muted">{r.scoreLabel}</span>
                  </span>
                )}
              </div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                {(r.stats[e.playerId] ?? []).map((l) => (
                  <div key={l.label} className="flex justify-between gap-2">
                    <dt className="text-muted">{l.label}</dt>
                    <dd className="font-display">{l.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </section>

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
        {isHost ? (
          <>
            <button className="btn-primary min-h-14 text-xl" onClick={() => act("game:playAgain", {})} data-testid="play-again">
              <RotateCcw /> Play again
            </button>
            <button className="btn-secondary" onClick={() => act("game:abort", {})} data-testid="back-to-lobby">
              Back to lobby (pick another game)
            </button>
          </>
        ) : (
          <p className="text-center text-muted">The host picks what&apos;s next.</p>
        )}
        <button className="btn-ghost" onClick={() => router.push("/")}>
          <Home size={18} /> Leave
        </button>
      </div>
    </div>
  );
}
