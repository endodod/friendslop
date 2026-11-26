"use client";
import { AnimatePresence, motion } from "framer-motion";
import { Hand, Heart } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { COUNTUP, type CountPrivate, type CountPublic } from "@party-game/shared";
import { useStore } from "@/lib/store";
import { play } from "@/lib/sfx";
import { useRemaining } from "@/lib/time";
import { Avatar, Icon, PlayerName, usePlayers } from "../ui";
import { Confetti } from "../fx";
import { HubSkip, hubAct, useHubPriv, useHubState } from "./common";

const GREEN = "#2fd27a";

/** A number card. */
function NumCard({ n, size = "md", dim, highlight }: { n: number; size?: "sm" | "md" | "lg" | "xl"; dim?: boolean; highlight?: boolean }) {
  const cls = {
    sm: "h-10 w-8 text-sm rounded-md",
    md: "h-20 w-14 text-2xl rounded-xl",
    lg: "h-32 w-24 text-5xl rounded-2xl",
    xl: "h-48 w-36 text-7xl rounded-3xl",
  }[size];
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center font-display shadow-[0_5px_0_#0005] ${cls} ${dim ? "bg-bg-2 text-muted line-through" : "text-[#06210f]"}`}
      style={
        dim
          ? undefined
          : {
              background: highlight ? `linear-gradient(160deg, #fff, ${GREEN})` : `linear-gradient(160deg, ${GREEN}, #1fa85e)`,
              boxShadow: highlight ? `0 0 0 3px #fff, 0 0 24px ${GREEN}` : undefined,
            }
      }
    >
      {n}
    </span>
  );
}

function Status({ s, display }: { s: CountPublic; display: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2" data-testid="countup-status">
      <span className={`font-display ${display ? "text-3xl" : "text-xl"}`}>
        Level {s.level}
        <span className="text-muted">/{s.totalLevels}</span>
      </span>
      <span className="flex items-center gap-3">
        <span className="flex items-center gap-0.5" aria-label={`${s.lives} lives`} title="Lives">
          {Array.from({ length: Math.max(s.lives, 0) }, (_, i) => (
            <motion.span key={i} initial={{ scale: 0 }} animate={{ scale: 1 }} className="text-bad">
              <Heart size={display ? 28 : 20} fill="currentColor" />
            </motion.span>
          ))}
        </span>
        <span className="flex items-center gap-1 rounded-full bg-panel-2 px-2 py-0.5 text-sm" title="Syncs left" aria-label={`${s.syncs} syncs left`}>
          <Hand size={16} /> ×{s.syncs}
        </span>
      </span>
    </div>
  );
}

/** Everyone around the table: cards left and raised hands. */
function Table({ s, display }: { s: CountPublic; display: boolean }) {
  const players = usePlayers();
  return (
    <div className="flex flex-wrap justify-center gap-3">
      {s.players.map((p) => {
        const n = s.handCounts[p] ?? 0;
        const raised = s.raised.includes(p);
        return (
          <div key={p} className={`flex flex-col items-center gap-1 rounded-2xl px-2 py-1.5 ${raised ? "bg-accent/20 ring-2 ring-accent" : "bg-bg-2"}`}>
            <span className="relative">
              <Avatar player={players[p]} size={display ? 48 : 34} dim={n === 0} />
              {raised && (
                <motion.span initial={{ y: 6, scale: 0 }} animate={{ y: 0, scale: 1 }} className="absolute -right-2 -top-2 rounded-full bg-accent p-0.5 text-[#14112a]">
                  <Hand size={14} />
                </motion.span>
              )}
            </span>
            <span className="flex h-5 items-end -space-x-2">
              {Array.from({ length: Math.min(n, 8) }, (_, i) => (
                <span key={i} className="h-5 w-3.5 rounded-sm border border-[#06210f]/40" style={{ background: GREEN }} />
              ))}
              {n === 0 && <span className="text-xs text-muted">done</span>}
            </span>
            <span className="max-w-20 truncate text-xs text-muted">{players[p]?.name}</span>
          </div>
        );
      })}
    </div>
  );
}

function Pile({ s, display }: { s: CountPublic; display: boolean }) {
  const players = usePlayers();
  const top = s.pile[s.pile.length - 1];
  const before = s.pile.slice(-6, -1);
  return (
    <div className="flex flex-col items-center gap-2" data-testid="countup-pile">
      <div className="relative flex min-h-48 items-center justify-center">
        <AnimatePresence mode="popLayout">
          {top ? (
            <motion.div
              key={`${top.card}`}
              initial={{ y: 120, rotate: 12, opacity: 0 }}
              animate={{ y: 0, rotate: 0, opacity: 1 }}
              transition={{ type: "spring", stiffness: 220, damping: 18 }}
              className="flex flex-col items-center gap-1"
            >
              <NumCard n={top.card} size={display ? "xl" : "lg"} />
              <span className="flex items-center gap-1 text-sm text-muted">
                <Avatar player={players[top.playerId]} size={18} /> {players[top.playerId]?.name}
              </span>
            </motion.div>
          ) : (
            <motion.span key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex h-32 w-24 items-center justify-center rounded-2xl border-2 border-dashed border-line font-display text-muted">
              start
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      {before.length > 0 && (
        <div className="flex items-center gap-1 opacity-70">
          {before.map((x) => (
            <NumCard key={x.card} n={x.card} size="sm" />
          ))}
          <span className="px-1 text-muted">→</span>
        </div>
      )}
    </div>
  );
}

/** Last 10 seconds before the idle loss. */
function IdleWarning({ endsAt }: { endsAt: number | null }) {
  const left = useRemaining(endsAt, 200);
  const secs = Math.ceil(left / 1000);
  const warn = !!endsAt && left > 0 && left <= COUNTUP.idleWarnMs;
  const last = useRef(-1);
  useEffect(() => {
    if (warn && secs !== last.current) {
      last.current = secs;
      play("tick");
    }
  }, [warn, secs]);
  return (
    <AnimatePresence>
      {warn && (
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: [1, 1.04, 1], opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ scale: { repeat: Infinity, duration: 1 } }}
          className="rounded-2xl bg-bad/20 p-3 text-center ring-2 ring-bad"
          role="alert"
          data-testid="countup-idle"
        >
          <span className="font-display text-2xl text-bad">Someone play! {secs}</span>
          <span className="block text-sm text-muted">No card for almost a minute: the crew loses in {secs}s.</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function MyHand({ s }: { s: CountPublic }) {
  const priv = useHubPriv<CountPrivate>();
  const playerId = useStore((st) => st.playerId);
  const hand = priv?.hand ?? [];
  const raised = !!playerId && s.raised.includes(playerId);
  const playing = s.phase === "play";
  const [busy, setBusy] = useState(false);
  if (!hand.length)
    return (
      <p className="rounded-2xl bg-bg-2 p-4 text-center font-display text-lg text-muted" data-testid="countup-hand">
        All your cards are down. Cheer the others on (silently)!
      </p>
    );
  return (
    <div className="flex flex-col gap-3" data-testid="countup-hand">
      <div className="flex flex-wrap justify-center gap-2">
        {hand.map((n, i) => (
          <motion.span key={n} layout initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: i * 0.05 }}>
            <NumCard n={n} highlight={i === 0} />
          </motion.span>
        ))}
      </div>
      <motion.button
        whileTap={playing ? { scale: 0.95 } : undefined}
        className="btn-primary min-h-20 text-3xl"
        disabled={!playing || busy}
        onClick={async () => {
          setBusy(true);
          await hubAct({ type: "play" });
          setBusy(false);
        }}
        data-testid="countup-play"
      >
        Play {hand[0]}
      </motion.button>
      {s.syncs > 0 && (
        <button
          className={`min-h-12 rounded-2xl font-display transition-colors ${raised ? "bg-accent text-[#14112a]" : "bg-panel-2"}`}
          disabled={!playing}
          aria-pressed={raised}
          onClick={() => hubAct({ type: "raise", on: !raised })}
          data-testid="countup-raise"
        >
          <Hand size={18} className="mr-2 inline" />
          {raised ? "Hand raised: waiting for everyone (tap to lower)" : `Raise hand for a sync (${s.syncs} left)`}
        </button>
      )}
    </div>
  );
}

function Discards({ list }: { list: { playerId: string; cards: number[] }[] }) {
  const players = usePlayers();
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {list.map((d) => (
        <span key={d.playerId} className="flex items-center gap-1.5 rounded-full bg-bg-2 py-1 pl-1 pr-2">
          <Avatar player={players[d.playerId]} size={24} />
          {d.cards.map((c) => (
            <NumCard key={c} n={c} size="sm" dim />
          ))}
        </span>
      ))}
    </div>
  );
}

function Interlude({ s, display }: { s: CountPublic; display: boolean }) {
  const players = usePlayers();
  if (s.phase === "ready")
    return (
      <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex flex-col items-center gap-2 py-4 text-center">
        <span className={`font-display ${display ? "text-6xl" : "text-4xl"}`} style={{ color: GREEN }}>
          Level {s.level}
        </span>
        <span className="text-lg text-muted">
          {s.level} card{s.level > 1 ? "s" : ""} each. Breathe. No talking about numbers.
        </span>
      </motion.div>
    );
  if (s.phase === "clear")
    return (
      <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex flex-col items-center gap-2 py-2 text-center">
        <Confetti fireKey={`level-${s.level}`} count={60} />
        <span className={`font-display text-good ${display ? "text-6xl" : "text-4xl"}`}>Level {s.level} cleared!</span>
        {s.reward?.life && <span className="font-display text-lg">+1 life</span>}
        {s.reward?.sync && <span className="font-display text-lg">+1 sync</span>}
        <HubSkip label="Next level" />
      </motion.div>
    );
  if (s.phase === "oops" && s.mistake)
    return (
      <motion.div initial={{ x: -10 }} animate={{ x: [10, -8, 6, 0] }} transition={{ duration: 0.4 }} className="flex flex-col items-center gap-2 rounded-2xl bg-bad/15 p-4 text-center" data-testid="countup-oops">
        <span className={`font-display text-bad ${display ? "text-5xl" : "text-3xl"}`}>Too early! −1 life</span>
        <span className="text-muted">
          <PlayerName player={players[s.mistake.by]} /> played {s.mistake.card}, but these were still out:
        </span>
        <Discards list={s.mistake.discarded} />
        <HubSkip label="Continue" />
      </motion.div>
    );
  if (s.phase === "oops" && s.sync)
    return (
      <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }} className="flex flex-col items-center gap-2 rounded-2xl bg-accent/15 p-4 text-center">
        <span className={`font-display text-accent ${display ? "text-5xl" : "text-3xl"}`}>Sync!</span>
        <span className="text-muted">Everyone threw away their lowest card:</span>
        <Discards list={s.sync.discarded} />
        <HubSkip label="Continue" />
      </motion.div>
    );
  return null;
}

export function CountUpView({ display }: { display: boolean; controller?: boolean }) {
  const s = useHubState<CountPublic>();
  const playerId = useStore((st) => st.playerId);
  const inGame = !!playerId && s.players.includes(playerId);
  const prevPile = useRef(s.pile.length);
  useEffect(() => {
    if (s.pile.length > prevPile.current) play("pop");
    prevPile.current = s.pile.length;
  }, [s.pile.length]);
  return (
    <div className="flex flex-col gap-4" data-testid="countup">
      <Status s={s} display={display} />
      <Table s={s} display={display} />
      {s.phase === "play" && <IdleWarning endsAt={s.phaseEndsAt} />}
      <Interlude s={s} display={display} />
      {(s.phase === "play" || s.phase === "oops") && <Pile s={s} display={display} />}
      {!display && inGame && (s.phase === "play" || s.phase === "oops" || s.phase === "ready") && <MyHand s={s} />}
    </div>
  );
}

/** Side panel: the level track with the rewards on the way. */
export function CountUpSide() {
  const s = useHubState<CountPublic>();
  return (
    <div className="flex flex-col gap-3" data-testid="countup-side">
      <h3 className="font-display text-xl text-muted">Levels</h3>
      <ol className="flex flex-col gap-1.5">
        {Array.from({ length: s.totalLevels }, (_, i) => i + 1).map((lv) => {
          const done = lv < s.level || (lv === s.level && (s.phase === "clear" || s.won === true));
          const now = lv === s.level && !done;
          return (
            <li
              key={lv}
              className={`flex items-center gap-2 rounded-xl px-3 py-1.5 ${done ? "bg-good/20" : "bg-bg-2"}`}
              style={{ boxShadow: now ? `inset 0 0 0 2px ${GREEN}` : "none" }}
            >
              <span className={`w-6 font-display ${done ? "text-good" : now ? "" : "text-muted"}`}>{done ? "✓" : lv}</span>
              <span className="flex-1 text-sm text-muted">
                {lv} card{lv > 1 ? "s" : ""} each
              </span>
              {COUNTUP.lifeAfter.includes(lv) && (
                <span className="text-bad" title="+1 life when cleared">
                  <Heart size={14} fill="currentColor" />
                </span>
              )}
              {COUNTUP.syncAfter.includes(lv) && <Hand size={16} className="text-accent" aria-label="+1 sync when cleared" />}
            </li>
          );
        })}
      </ol>
      <p className="text-xs text-muted">Clear a level with a heart or a hand to earn a life or a sync.</p>
    </div>
  );
}
