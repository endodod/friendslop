"use client";
import { motion } from "framer-motion";
import { UserX, WifiOff } from "lucide-react";
import { useStore } from "@/lib/store";
import { act } from "@/lib/useRoom";
import { colorHex, standings, type PublicGameState } from "@party-game/shared";
import { Avatar, CoinCount, Icon, StarCount, useIsHost, usePlayers } from "../ui";
import { CoinDelta } from "../fx";

/** Player chips: stars, coins, items held. Ordered by current standing. */
export function Scoreboard({ game, compact, highlight }: { game: PublicGameState; compact?: boolean; highlight?: string | null }) {
  const players = usePlayers();
  const isHost = useIsHost();
  const me = useStore((s) => s.playerId);
  const ranking = standings(game as never);
  const activeId = game.order[game.activeIndex];
  return (
    <ol className={`grid gap-2 ${compact ? "grid-cols-2" : "grid-cols-2 lg:grid-cols-1"}`} aria-label="Scoreboard">
      {ranking.map(({ playerId, rank }) => {
        const p = players[playerId];
        const gp = game.players[playerId];
        if (!p || !gp) return null;
        const active = playerId === activeId && game.phase !== "podium";
        return (
          <motion.li
            layout
            key={playerId}
            className={`relative flex items-center gap-2 rounded-2xl p-2 ${active ? "bg-panel-2" : "bg-bg-2"}`}
            style={{ boxShadow: active || highlight === playerId ? `inset 0 0 0 3px ${colorHex(p.color)}` : undefined }}
          >
            <span className="w-5 text-center font-display text-muted">{rank}</span>
            <span className="relative">
              <Avatar player={p} size={compact ? 32 : 40} dim={!p.connected} />
              {!p.connected && <WifiOff size={14} className="absolute -bottom-1 -right-1 text-bad" aria-label="disconnected" />}
            </span>
            <div className="flex min-w-0 flex-1 flex-col leading-tight">
              <span className="truncate font-display">{p.name}</span>
              <span className="flex items-center gap-3 text-sm">
                <StarCount value={gp.stars} size={16} />
                <CoinCount value={gp.coins} size={16} />
                {gp.effects.frozen && (
                  <span className="inline-flex items-center gap-0.5 text-[#7fd3ff]" title="Frozen: skips next turn">
                    <Icon id="ice" size={14} /> frozen
                  </span>
                )}
                {gp.itemCount > 0 && (
                  <span className="inline-flex items-center gap-0.5 text-muted" title={`${gp.itemCount} items`}>
                    <Icon id="backpack" size={14} />
                    {gp.itemCount}
                  </span>
                )}
              </span>
            </div>
            {isHost && !p.connected && playerId !== me && game.phase !== "podium" && (
              <button
                className="btn-ghost min-h-11 min-w-11 shrink-0 px-1 text-bad"
                aria-label={`Remove ${p.name} from the game`}
                title="Disconnected: remove from the game"
                onClick={() => {
                  if (confirm(`Remove ${p.name} from the game? They can't come back to this game.`)) act("room:kick", { playerId });
                }}
              >
                <UserX size={18} />
              </button>
            )}
            <CoinDelta playerId={playerId} />
          </motion.li>
        );
      })}
    </ol>
  );
}
