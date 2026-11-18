"use client";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Dices, FastForward, ShoppingBag } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { GAME_CONFIG, itemPrice, localize, starPrice, type Board, type PublicGameState } from "@party-game/shared";
import { clientContent } from "@party-game/content";
import { useStore } from "@/lib/store";
import { act } from "@/lib/useRoom";
import { useRemaining } from "@/lib/time";
import { Avatar, CoinCount, Icon, PlayerName, StarCount, Timer, useIsHost, usePlayers } from "../ui";
import { DieFace, RollingDie } from "./Dice";
import { BoardRules, ReadyUp } from "./HowToPlay";

const T = GAME_CONFIG.timers;

export function useGameCtx() {
  const g = useStore((s) => s.pub?.game)!;
  const playerId = useStore((s) => s.playerId);
  const players = usePlayers();
  const activeId = g.order[g.activeIndex];
  return { g, playerId, players, activeId, isActive: playerId === activeId, active: players[activeId] };
}

function Panel({ children, testId }: { children: React.ReactNode; testId?: string }) {
  return (
    <motion.div
      initial={{ y: 16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: -16, opacity: 0 }}
      className="flex flex-col gap-4"
      data-testid={testId}
    >
      {children}
    </motion.div>
  );
}

export function SkipButton() {
  const isHost = useIsHost();
  if (!isHost) return null;
  return (
    <button className="btn-ghost min-h-11 self-end text-sm" onClick={() => act("game:continue", {})}>
      <FastForward size={16} /> Skip
    </button>
  );
}

function Waiting({ text }: { text: React.ReactNode }) {
  const { active } = useGameCtx();
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-bg-2 p-4">
      <Avatar player={active} size={44} />
      <p className="font-display text-xl">{text}</p>
    </div>
  );
}

const fmtName = (n: unknown) => (typeof n === "string" ? n : localize(n as never));

// ---------------------------------------------------------------------------
export function PhasePanel({ board, display }: { board: Board | null; display?: boolean }) {
  const { g } = useGameCtx();
  const key = `${g.phase}-${g.activeIndex}-${g.round}`;
  return (
    <AnimatePresence mode="wait">
      <motion.div key={key} className="flex flex-col gap-3">
        {(() => {
          switch (g.phase) {
            case "gameStart":
              return <GameStartPanel />;
            case "turnStart":
              return <TurnStartPanel display={display} />;
            case "rolling":
            case "moving":
              return <RollingPanel />;
            case "junctionChoice":
              return <JunctionPanel board={board} display={display} />;
            case "tileEffect":
              return <TileEffectPanel />;
            case "shop":
              return <ShopPanel display={display} />;
            case "starPurchase":
              return <StarPanel display={display} />;
            case "event":
              return <EventPanel />;
            case "duel":
              return <DuelPanel display={display} />;
            case "turnEnd":
              return <Waiting text="Next turn…" />;
            case "roundEnd":
              return <RoundEndPanel />;
            default:
              return null;
          }
        })()}
      </motion.div>
    </AnimatePresence>
  );
}

export function GameStartPanel() {
  const { g, players } = useGameCtx();
  return (
    <Panel testId="game-start">
      <h2 className="font-display text-4xl text-accent">How to play</h2>
      <BoardRules compact />
      <div className="flex flex-col gap-2 rounded-2xl bg-bg-2 p-3">
        <p className="font-display text-muted">
          {g.turnCount > 0 ? `${g.turnCount} rounds` : "Unlimited rounds"} · turn order
        </p>
        <ol className="flex flex-wrap gap-3">
          {g.order.map((pid, i) => (
            <li key={pid} className="flex items-center gap-2 font-display text-lg">
              <span className="text-muted">{i + 1}.</span>
              <Avatar player={players[pid]} size={30} />
              <PlayerName player={players[pid]} />
            </li>
          ))}
        </ol>
      </div>
      <p className="text-center text-sm text-muted">Tiles and items are explained under the ? button at the top.</p>
      <Timer endsAt={g.phaseEndsAt} totalMs={T.gameStartMs} silent />
      <ReadyUp who={g.order} />
      <SkipButton />
    </Panel>
  );
}

function TurnStartPanel({ display }: { display?: boolean }) {
  const { g, isActive, active, players, playerId } = useGameCtx();
  const priv = useStore((s) => s.priv);
  const [customValue, setCustomValue] = useState(6);
  const [targeting, setTargeting] = useState<string | null>(null);
  // Desktop: Space rolls the dice on your turn.
  const canRoll = isActive && !display && !targeting;
  const rollRef = useRef(() => {});
  rollRef.current = () => act("turn:roll", g.pendingDice?.kind === "custom" ? { value: customValue } : {});
  useEffect(() => {
    if (!canRoll) return;
    const down = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.code !== "Space" || e.repeat || (el && ["INPUT", "TEXTAREA", "BUTTON"].includes(el.tagName))) return;
      e.preventDefault();
      rollRef.current();
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [canRoll]);

  if (!isActive || display) {
    return (
      <Panel>
        <Waiting text={<>{active?.name}&apos;s turn</>} />
        <Timer endsAt={g.phaseEndsAt} totalMs={T.turnStartMs} silent />
      </Panel>
    );
  }
  const items = (priv?.items ?? []).map((id) => clientContent.items.find((i) => i.id === id)!).filter(Boolean);
  const others = g.order.filter((p) => p !== playerId);
  const pending = g.pendingDice?.kind;

  return (
    <Panel testId="turn-start">
      <h2 className="font-display text-3xl">Your turn!</h2>
      <Timer endsAt={g.phaseEndsAt} totalMs={T.turnStartMs} />
      {items.length === 0 && (
        <p className="flex items-center gap-2 rounded-2xl bg-bg-2 p-3 text-sm text-muted">
          <Icon id="shop" size={20} className="shrink-0 text-good" />
          No items yet. Buy them at green Shop tiles (also when walking past one) or land on a pink Item tile for a free one.
        </p>
      )}
      {items.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="font-display text-lg text-muted">Your items</p>
          <div className="flex flex-wrap gap-2">
            {items.map((it, i) => {
              const usable = it.useTiming === "turnStart" && !((it.effect === "doubleDice" || it.effect === "customDice") && pending);
              return (
                <button
                  key={`${it.id}-${i}`}
                  className="btn-secondary min-h-12 text-base"
                  disabled={!usable}
                  title={localize(it.description)}
                  onClick={() => (it.needsTarget ? setTargeting(it.id) : act("turn:useItem", { itemId: it.id }))}
                >
                  <Icon id={it.icon} size={20} />
                  {localize(it.name)}
                  {it.useTiming !== "turnStart" && <span className="text-xs text-muted">({it.useTiming === "passive" ? "auto" : "in questions"})</span>}
                </button>
              );
            })}
          </div>
          {targeting && (
            <div className="card flex flex-col gap-2 p-3">
              <p className="font-display">{localize(clientContent.items.find((i) => i.id === targeting)!.name)}: pick a player</p>
              <div className="flex flex-wrap gap-2">
                {(targeting === "pick-target" ? g.order : others).map((pid) => (
                  <button
                    key={pid}
                    className="btn-secondary"
                    onClick={async () => {
                      await act("turn:useItem", { itemId: targeting, targetId: pid });
                      setTargeting(null);
                    }}
                  >
                    <Avatar player={players[pid]} size={28} /> {players[pid]?.name}
                  </button>
                ))}
                <button className="btn-ghost" onClick={() => setTargeting(null)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {g.targetOverride && (
        <p className="text-sm text-accent">Next question is about {players[g.targetOverride.targetId]?.name}.</p>
      )}
      {pending === "custom" ? (
        <div className="flex flex-col gap-2">
          <p className="font-display text-lg">Custom dice: pick your roll</p>
          <div className="grid grid-cols-6 gap-2">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <button
                key={n}
                aria-pressed={customValue === n}
                onClick={() => setCustomValue(n)}
                className={`rounded-2xl p-1 ${customValue === n ? "ring-4 ring-accent" : "opacity-70"}`}
              >
                <DieFace value={n} size={44} />
              </button>
            ))}
          </div>
        </div>
      ) : pending === "double" ? (
        <p className="font-display text-lg text-accent">Double dice ready!</p>
      ) : null}
      <motion.button
        data-testid="roll-button"
        whileTap={{ scale: 0.9, rotate: -8 }}
        className="btn-primary anim-breathe anim-sheen min-h-16 text-3xl"
        onClick={() => act("turn:roll", pending === "custom" ? { value: customValue } : {})}
      >
        <Dices size={30} /> Roll!
      </motion.button>
      <p className="hidden text-center text-sm text-muted [@media(pointer:fine)]:block">
        or press <kbd className="rounded-md border border-line bg-bg-2 px-1.5 py-0.5 text-xs text-ink">Space</kbd>
      </p>
    </Panel>
  );
}

function RollingPanel() {
  const { g, active } = useGameCtx();
  const rolling = g.phase === "rolling";
  const remaining = useRemaining(g.phaseEndsAt, 100);
  const tumbling = rolling && remaining > 550;
  const values = g.dice?.values ?? [1];
  return (
    <Panel>
      <div className="flex items-center justify-center gap-4 py-2">
        {values.map((v, i) => (
          <RollingDie key={i} value={v} rolling={tumbling} />
        ))}
      </div>
      <p className="text-center font-display text-2xl">
        <PlayerName player={active} /> {rolling ? "rolled" : "moves"}{" "}
        <span className="text-accent">{tumbling ? "…" : g.dice?.total}</span>
        {!tumbling && g.dice?.bonus ? <span className="text-lg text-muted"> (incl. +{g.dice.bonus} Sprint Shoes)</span> : null}
        {g.movement && !rolling && g.movement.remaining > 0 ? ` · ${g.movement.remaining} left` : ""}
      </p>
    </Panel>
  );
}

function JunctionPanel({ board, display }: { board: Board | null; display?: boolean }) {
  const { g, isActive, active } = useGameCtx();
  if (!isActive || display || !board || !g.junction) {
    return (
      <Panel>
        <Waiting text={<>{active?.name} is choosing a path…</>} />
        <Timer endsAt={g.phaseEndsAt} totalMs={T.junctionMs} silent />
      </Panel>
    );
  }
  return (
    <Panel testId="junction">
      <h2 className="font-display text-3xl">Which way?</h2>
      <Timer endsAt={g.phaseEndsAt} totalMs={T.junctionMs} />
      <p className="text-muted">{g.movement?.remaining} steps left. Tap a direction (or a glowing tile on the board).</p>
      <div className="grid grid-cols-2 gap-3">
        {g.junction.options.map((tileId, i) => {
          const tile = board.tiles.find((t) => t.id === tileId);
          const type = g.tileTypes[tileId] ?? tile?.type;
          const def = clientContent.tiles.find((d) => d.id === type);
          // Peek a few tiles down this path
          const preview: string[] = [];
          let cur = tileId;
          for (let k = 0; k < 4 && cur; k++) {
            preview.push(g.tileTypes[cur] ?? board.tiles.find((t) => t.id === cur)?.type ?? "");
            cur = board.tiles.find((t) => t.id === cur)?.next[0] ?? "";
          }
          return (
            <button key={tileId} className="btn-secondary min-h-24 flex-col" onClick={() => act("turn:chooseDirection", { tileId })}>
              <span className="flex items-center gap-1 font-display text-xl">
                Path {i + 1} <ArrowRight size={18} />
              </span>
              <span className="flex gap-1">
                {preview.map((pt, k) => {
                  const d = clientContent.tiles.find((x) => x.id === pt);
                  return (
                    <span key={k} className="flex h-7 w-7 items-center justify-center rounded-full" style={{ background: d?.color }}>
                      <Icon id={d?.icon ?? "question"} size={16} className="text-[#14112a]" />
                    </span>
                  );
                })}
              </span>
              <span className="sr-only">{def ? fmtName(def.name) : ""}</span>
            </button>
          );
        })}
      </div>
    </Panel>
  );
}

function TileEffectPanel() {
  const { g, active } = useGameCtx();
  const r = g.tileResult;
  if (r?.type === "frozen")
    return (
      <Panel testId="tile-effect">
        <motion.div initial={{ scale: 0.5 }} animate={{ scale: 1 }} className="flex items-center gap-4 rounded-3xl bg-[#bfe9ff] p-4 text-[#14112a]">
          <Icon id="ice" size={56} />
          <p className="font-display text-2xl">{r.text}</p>
        </motion.div>
        <SkipButton />
      </Panel>
    );
  const def = clientContent.tiles.find((d) => d.id === r?.type);
  return (
    <Panel testId="tile-effect">
      <motion.div
        initial={{ scale: 0.4, rotate: -20 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 12 }}
        className="flex items-center gap-4 rounded-3xl p-4"
        style={{ background: def?.color }}
      >
        <Icon id={def?.icon ?? "question"} size={56} className="text-[#14112a]" />
        <div className="text-[#14112a]">
          <p className="font-display text-3xl">{def ? fmtName(def.name) : ""}</p>
          <p className="font-semibold">{def ? fmtName(def.description) : ""}</p>
        </div>
      </motion.div>
      {r?.roll !== undefined && (
        <div className="flex items-center justify-center gap-3">
          <RollingDie value={r.roll} rolling={false} size={70} />
          <span className="font-display text-2xl">× 2</span>
        </div>
      )}
      {r?.text && <p className="text-center font-display text-2xl">{r.text}</p>}
      {r?.itemId && <GainedItem itemId={r.itemId} />}
      {r?.itemId === null && <p className="text-center text-muted">Bag full (3 items), coins instead!</p>}
      {r?.coinsDelta !== undefined && (
        <p className="text-center font-display text-3xl">
          <PlayerName player={active} />{" "}
          <span className={r.coinsDelta >= 0 ? "text-accent" : "text-bad"}>
            {r.coinsDelta >= 0 ? "+" : ""}
            {r.coinsDelta} coins
          </span>
        </p>
      )}
      <SkipButton />
    </Panel>
  );
}

function GainedItem({ itemId }: { itemId: string }) {
  const { active } = useGameCtx();
  const it = clientContent.items.find((i) => i.id === itemId);
  if (!it) return null;
  return (
    <motion.div
      initial={{ scale: 0, rotate: -30 }}
      animate={{ scale: 1, rotate: 0 }}
      transition={{ delay: 0.4, type: "spring", stiffness: 220, damping: 12 }}
      className="flex items-center gap-4 rounded-3xl bg-bg-2 p-4"
    >
      <Icon id={it.icon} size={56} className="shrink-0 text-accent" />
      <div>
        <p className="font-display text-2xl">
          <PlayerName player={active} /> got {localize(it.name)}!
        </p>
        <p className="text-muted">{localize(it.description)}</p>
      </div>
    </motion.div>
  );
}

function ShopPanel({ display }: { display?: boolean }) {
  const { g, isActive, active, playerId } = useGameCtx();
  const priv = useStore((s) => s.priv);
  const me = playerId ? g.players[playerId] : null;
  const stock = (g.shop?.stock ?? []).map((id) => clientContent.items.find((i) => i.id === id)!).filter(Boolean);
  const canAct = isActive && !display;
  const full = (priv?.items.length ?? 0) >= GAME_CONFIG.economy.maxItems;
  return (
    <Panel testId="shop">
      <h2 className="flex items-center gap-2 font-display text-3xl">
        <ShoppingBag /> Shop {!canAct && <span className="text-xl text-muted">· {active?.name} is browsing</span>}
      </h2>
      {g.shop?.passing && <p className="text-sm text-muted">Walking past the shop: buy something or keep going.</p>}
      <Timer endsAt={g.phaseEndsAt} totalMs={T.shopMs} silent={!canAct} />
      {canAct && (
        <p className="text-muted">
          You have <CoinCount value={me?.coins ?? 0} size={16} /> · {priv?.items.length ?? 0}/{GAME_CONFIG.economy.maxItems} items
        </p>
      )}
      <ul className="flex flex-col gap-1.5">
        {stock.map((it) => {
          const bought = g.shop?.bought.includes(it.id);
          const price = itemPrice(it, g.order.length);
          const afford = (me?.coins ?? 0) >= price;
          return (
            <li key={it.id} className="flex items-center gap-3 rounded-2xl bg-bg-2 px-3 py-2">
              <Icon id={it.icon} size={30} className="shrink-0 text-accent" />
              <div className="min-w-0 flex-1">
                <p className="flex items-baseline gap-2 font-display leading-tight">
                  <span className="truncate">{localize(it.name)}</span>
                  {!canAct && <CoinCount value={price} size={14} className="shrink-0 text-sm text-muted" />}
                </p>
                <p className="line-clamp-2 text-xs leading-snug text-muted">{localize(it.description)}</p>
              </div>
              {canAct && (
                <button
                  className="btn-primary min-h-11 w-[4.5rem] shrink-0 px-2 text-base"
                  disabled={!afford || full || bought}
                  aria-label={`Buy ${localize(it.name)} for ${price} coins`}
                  onClick={() => act("shop:buy", { itemId: it.id })}
                >
                  {bought ? (
                    "✓"
                  ) : (
                    <span className="inline-flex items-center gap-1">
                      <Icon id="coin" size={16} className="text-[#241a00]/80" />
                      {price}
                    </span>
                  )}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {canAct && (
        <button className="btn-secondary" onClick={() => act("shop:leave", {})}>
          {g.shop?.passing ? "Keep walking" : "Done shopping"}
        </button>
      )}
    </Panel>
  );
}

function StarPanel({ display }: { display?: boolean }) {
  const { g, isActive, active, playerId } = useGameCtx();
  const coins = g.players[g.order[g.activeIndex]]?.coins ?? 0;
  const priv = useStore((st) => st.priv);
  const cost = isActive ? starPrice(clientContent, priv?.items ?? []) : GAME_CONFIG.economy.starCost;
  const discounted = cost < GAME_CONFIG.economy.starCost;
  const afford = coins >= cost;
  void playerId;
  return (
    <Panel testId="star">
      <motion.div
        animate={{ rotate: [0, 8, -8, 0], scale: [1, 1.1, 1] }}
        transition={{ repeat: Infinity, duration: 2 }}
        className="mx-auto"
      >
        <Icon id="star" size={90} className="text-[#ffe066] drop-shadow-[0_4px_0_#b38a12]" />
      </motion.div>
      <h2 className="text-center font-display text-3xl">
        {g.star?.passing ? "Passing the star!" : "You found the star!"}
      </h2>
      <p className="text-center text-lg">
        A star costs <CoinCount value={cost} size={18} />
        {discounted && <span className="text-good"> (Star Coupon!)</span>}.{" "}
        {isActive ? (afford ? "Buy it?" : "You can't afford it…") : `${active?.name} has ${coins} coins.`}
      </p>
      <Timer endsAt={g.phaseEndsAt} totalMs={T.starPurchaseMs} silent={!isActive} />
      {isActive && !display && (
        <div className="grid grid-cols-2 gap-3">
          <button className="btn-primary min-h-14 text-2xl" disabled={!afford} onClick={() => act("star:buy", { buy: true })}>
            <StarCount value={1} /> Buy
          </button>
          <button className="btn-secondary min-h-14" onClick={() => act("star:buy", { buy: false })}>
            {afford ? "No thanks" : "Continue"}
          </button>
        </div>
      )}
    </Panel>
  );
}

function EventPanel() {
  const { g } = useGameCtx();
  const card = clientContent.events.find((e) => e.id === g.event?.cardId);
  return (
    <Panel testId="event">
      <motion.div
        initial={{ rotateY: 180, scale: 0.5 }}
        animate={{ rotateY: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 140, damping: 14 }}
        className="card flex flex-col items-center gap-3 border-4 border-[#b26bff] p-6 text-center"
      >
        <Icon id={card?.icon ?? "event"} size={72} className="text-[#b26bff]" />
        <p className="font-display text-3xl">{card ? localize(card.name) : "Event"}</p>
        <p className="text-lg">{g.event?.text}</p>
      </motion.div>
      <SkipButton />
    </Panel>
  );
}

function DuelPanel({ display }: { display?: boolean }) {
  const { g, playerId, players, active } = useGameCtx();
  const mine = g.duel?.challengerId === playerId && !display;
  if (!mine)
    return (
      <Panel>
        <Waiting text={<>{active?.name} is picking a duel opponent…</>} />
      </Panel>
    );
  return (
    <Panel testId="duel-pick">
      <h2 className="flex items-center gap-2 font-display text-3xl">
        <Icon id="duel" size={32} /> Duel! Pick your opponent
      </h2>
      <Timer endsAt={g.phaseEndsAt} totalMs={T.duelPickMs} />
      <div className="grid grid-cols-2 gap-3">
        {g.order
          .filter((p) => p !== playerId)
          .map((pid) => (
            <button key={pid} className="btn-secondary min-h-16" onClick={() => act("duel:pick", { opponentId: pid })}>
              <Avatar player={players[pid]} size={36} />
              {players[pid]?.name}
              <CoinCount value={g.players[pid]?.coins ?? 0} size={14} className="text-sm text-muted" />
            </button>
          ))}
      </div>
    </Panel>
  );
}

function RoundEndPanel() {
  const { g } = useGameCtx();
  return (
    <Panel>
      <motion.h2
        initial={{ scale: 2, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="text-center font-display text-4xl text-accent"
      >
        Round {g.round} done!
      </motion.h2>
      <p className="text-center font-display text-2xl">Mini-game time!</p>
      <SkipButton />
    </Panel>
  );
}

export type { PublicGameState };
