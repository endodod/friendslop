"use client";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, UserX, WifiOff } from "lucide-react";
import { useState } from "react";
import { clientContent } from "@party-game/content";
import { useStore } from "@/lib/store";
import { act } from "@/lib/useRoom";
import { colorHex, localize, standings, type PublicGameState } from "@party-game/shared";
import { Avatar, CoinCount, CursedBadge, Icon, StarCount, useIsHost, usePlayers } from "../ui";
import { CoinDelta } from "../fx";

/** Player chips: stars, coins, items held. Ordered by current standing. */
export function Scoreboard({ game, compact, highlight }: { game: PublicGameState; compact?: boolean; highlight?: string | null }) {
  const players = usePlayers();
  const isHost = useIsHost();
  const me = useStore((s) => s.playerId);
  const ranking = standings(game as never);
  const activeId = game.order[game.activeIndex];
  const [openId, setOpenId] = useState<string | null>(null);
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
            className={`relative flex flex-wrap items-center gap-2 rounded-2xl p-2 ${active ? "bg-panel-2" : "bg-bg-2"} ${openId === playerId ? "col-span-full" : ""}`}
            style={{ boxShadow: active || highlight === playerId ? `inset 0 0 0 3px ${colorHex(p.color)}` : undefined }}
          >
            <span className="w-5 text-center font-display text-muted">{rank}</span>
            <span className="relative">
              <Avatar player={p} size={compact ? 32 : 40} dim={!p.connected} />
              {!p.connected && <WifiOff size={14} className="absolute -bottom-1 -right-1 text-bad" aria-label="disconnected" />}
            </span>
            <button
              type="button"
              className="flex min-w-0 flex-1 flex-col text-left leading-tight"
              aria-expanded={openId === playerId}
              aria-label={`${p.name}: show items`}
              onClick={() => setOpenId(openId === playerId ? null : playerId)}
            >
              <span className="flex items-center gap-1 truncate font-display">
                {p.name}
                {p.cursed && <CursedBadge />}
                <ChevronDown size={14} className={`shrink-0 text-muted transition-transform ${openId === playerId ? "rotate-180" : ""}`} />
              </span>
              <span className="flex flex-wrap items-center gap-x-3 text-sm">
                <StarCount value={gp.stars} size={16} />
                <CoinCount value={gp.coins} size={16} />
                {gp.effects.frozen && (
                  <span className="inline-flex items-center gap-0.5 text-[#7fd3ff]" title="Frozen: skips next turn">
                    <Icon id="ice" size={14} /> frozen
                  </span>
                )}
              </span>
              {(gp.items ?? []).length > 0 && (
                <span className="mt-1 flex flex-wrap items-center gap-1" title={`${gp.items.length} items`}>
                  {gp.items.map((id, i) => {
                    const it = clientContent.items.find((x) => x.id === id);
                    return (
                      <span key={`${id}-${i}`} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-accent/15 text-accent">
                        <Icon id={it?.icon ?? "backpack"} size={16} title={it ? localize(it.name) : id} />
                      </span>
                    );
                  })}
                </span>
              )}
            </button>
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
            <AnimatePresence initial={false}>
              {openId === playerId && (
                <motion.div
                  key="items"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="w-full overflow-hidden"
                >
                  <PlayerItems items={gp.items ?? []} name={p.name} />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.li>
        );
      })}
    </ol>
  );
}

/** The items a player holds, with what each one does. */
function PlayerItems({ items, name }: { items: string[]; name: string }) {
  if (items.length === 0) return <p className="px-1 pt-1 text-sm text-muted">{name} has no items.</p>;
  return (
    <ul className="flex flex-col gap-1.5 pt-1" aria-label={`${name}'s items`}>
      {items.map((id, i) => {
        const it = clientContent.items.find((x) => x.id === id);
        return (
          <li key={`${id}-${i}`} className="flex items-start gap-2 rounded-xl bg-bg/60 p-2">
            <Icon id={it?.icon ?? "backpack"} size={22} className="mt-0.5 shrink-0 text-accent" />
            <span className="text-sm leading-snug">
              <span className="font-display text-base">{it ? localize(it.name) : id}</span>
              {it && <span className="block text-muted">{localize(it.description)}</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
