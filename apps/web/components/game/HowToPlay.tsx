"use client";
import { AnimatePresence, motion } from "framer-motion";
import { Check, CircleHelp, X } from "lucide-react";
import { useState } from "react";
import { GAME_CONFIG, localize } from "@party-game/shared";
import { clientContent } from "@party-game/content";
import { useStore } from "@/lib/store";
import { act } from "@/lib/useRoom";
import { Avatar, CoinCount, Icon, usePlayers } from "../ui";

const E = GAME_CONFIG.economy;
const Q = GAME_CONFIG.question;

/** The goal of the board game + how to get there, in 4 steps. */
export function BoardRules({ compact }: { compact?: boolean }) {
  const settings = useStore((s) => s.pub?.settings);
  const goal = settings?.starGoal ?? 0;
  const star = <Icon id="star" size={18} className="mx-0.5 align-[-3px] text-[#ffe066]" />;
  return (
    <div className="flex flex-col gap-3">
      <Goal>
        {goal > 0 ? (
          <>
            First to {goal} {star} stars wins! {settings?.turnCount ? `(Otherwise: most stars after ${settings.turnCount} rounds.)` : "(No round limit: the host can finish the game any time.)"}
          </>
        ) : (
          <>Collect the most {star} stars. Coins break ties.{settings?.turnCount === 0 ? " No round limit: the host finishes the game with the flag button." : ""}</>
        )}
      </Goal>
      <Steps
        steps={[
          <>Roll and move. Where you land matters: check the tile colors below.</>,
          <>
            <b>Question tiles:</b> a question about someone. Everyone answers. Pick what <i>they</i> would pick: matching
            pays <CoinCount value={Q.guesserMatchCoins} size={14} />, the target earns <CoinCount value={Q.targetCoinsPerMatch} size={14} /> per match.
          </>,
          <>
            <b>Spend coins:</b> a star costs <CoinCount value={E.starCost} size={14} /> when you reach or pass it. Items are sold
            at green Shop tiles (also when you walk past one). Pink Item tiles give you one for free.
          </>,
          <>After everyone moved: a mini-game. Winners get the most coins.</>,
        ]}
      />
      {!compact && (
        <>
          <TileLegend />
          <ItemList />
        </>
      )}
    </div>
  );
}

export function Goal({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-accent/15 px-4 py-3 ring-2 ring-accent">
      <span className="rounded-lg bg-accent px-2 py-0.5 font-display text-sm uppercase text-[#241a00]">Goal</span>
      <span className="font-display text-lg leading-tight">{children}</span>
    </div>
  );
}

export function Steps({ steps }: { steps: React.ReactNode[] }) {
  return (
    <ol className="flex flex-col gap-2">
      {steps.map((s, i) => (
        <motion.li
          key={i}
          initial={{ x: -16, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 0.15 + i * 0.12 }}
          className="flex items-start gap-3 rounded-2xl bg-bg-2 p-3"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-panel-2 font-display">{i + 1}</span>
          <span className="leading-snug">{s}</span>
        </motion.li>
      ))}
    </ol>
  );
}

export function TileLegend() {
  // Only tile types that are on this game's board.
  const used = useStore((s) => s.pub?.game?.tileTypes);
  const onBoard = used ? new Set(Object.values(used)) : null;
  const tiles = clientContent.tiles.filter((t) => t.id !== "start" && (onBoard ? onBoard.has(t.id) : t.id !== "data"));
  return (
    <section className="flex flex-col gap-2">
      <h3 className="font-display text-lg text-muted">Tiles</h3>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {tiles.map((t) => (
          <li key={t.id} className="flex items-center gap-3 rounded-2xl bg-bg-2 p-2">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: t.color }}>
              <Icon id={t.icon} size={20} className="text-[#14112a]" />
            </span>
            <span className="text-sm leading-tight">
              <b className="font-display text-base">{localize(t.name)}</b> · {localize(t.description)}
            </span>
          </li>
        ))}
        <li className="flex items-center gap-3 rounded-2xl bg-bg-2 p-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#ffe066]">
            <Icon id="star" size={22} className="text-[#b38a12]" />
          </span>
          <span className="text-sm leading-tight">
            <b className="font-display text-base">Star</b> · buy for {E.starCost} coins when you reach or pass it. Then it moves.
          </span>
        </li>
      </ul>
    </section>
  );
}

export function ItemList() {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="font-display text-lg text-muted">Items (max {E.maxItems})</h3>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {clientContent.items.map((it) => (
          <li key={it.id} className="flex items-center gap-3 rounded-2xl bg-bg-2 p-2">
            <Icon id={it.icon} size={28} className="shrink-0 text-accent" />
            <span className="flex-1 text-sm leading-tight">
              <b className="font-display text-base">{localize(it.name)}</b> · {localize(it.description)}
            </span>
            <CoinCount value={it.price} size={14} className="text-sm" />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Tutorial for one mini-game: goal, steps, controls, bonus. */
export function MinigameTutorial({ id, showBonus = true }: { id: string; showBonus?: boolean }) {
  const meta = clientContent.minigames.find((m) => m.id === id);
  if (!meta) return null;
  return (
    <div className="flex flex-col gap-3 text-left">
      <Goal>{localize(meta.goal)}</Goal>
      <Steps steps={meta.howTo.map((s) => localize(s))} />
      <p className="rounded-2xl bg-bg-2 px-4 py-2 text-muted">
        <span className="font-display text-ink">Controls:</span> {localize(meta.controls)}
      </p>
      {showBonus && localize(meta.bonus) !== "—" && (
        <p className="rounded-2xl bg-bg-2 px-4 py-2 text-muted">
          <span className="font-display text-accent">Bonus</span> for matching the intro question: {localize(meta.bonus)}
        </p>
      )}
    </div>
  );
}

/** "Got it!" button + who's ready. Ends tutorial screens early once everyone is ready. */
export function ReadyUp({ who }: { who: string[] }) {
  const g = useStore((s) => s.pub?.game);
  const playerId = useStore((s) => s.playerId);
  const players = usePlayers();
  if (!g) return null;
  const meIn = !!playerId && who.includes(playerId);
  const iAmReady = !!playerId && g.ready.includes(playerId);
  return (
    <div className="flex flex-col items-center gap-3">
      {meIn && (
        <button
          className={iAmReady ? "btn-secondary min-h-14 w-full" : "btn-primary min-h-14 w-full text-2xl"}
          disabled={iAmReady}
          onClick={() => act("game:ready", {})}
          data-testid="got-it"
        >
          {iAmReady ? (
            <>
              <Check /> Waiting for the others…
            </>
          ) : (
            "Got it!"
          )}
        </button>
      )}
      <div className="flex flex-wrap justify-center gap-2" aria-label="Ready">
        {who.map((pid) => (
          <span key={pid} className="relative">
            <Avatar player={players[pid]} size={34} dim={!g.ready.includes(pid)} />
            {g.ready.includes(pid) && (
              <span className="absolute -bottom-1 -right-1 rounded-full bg-good p-0.5 text-[#06210f]">
                <Check size={10} strokeWidth={4} />
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

/** "?" button: board rules, tiles, items, and the current mini-game's tutorial. */
export function HelpButton({ minigameId }: { minigameId?: string | null }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"game" | "board">(minigameId ? "game" : "board");
  const meta = minigameId ? clientContent.minigames.find((m) => m.id === minigameId) : null;
  return (
    <>
      <button
        className="btn-ghost min-h-11 min-w-9 px-1 sm:min-w-11 sm:px-2"
        aria-label="How to play"
        onClick={() => {
          setTab(minigameId ? "game" : "board");
          setOpen(true);
        }}
      >
        <CircleHelp size={22} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[90] flex items-end justify-center bg-black/60 p-3 sm:items-center"
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ y: 40 }}
              animate={{ y: 0 }}
              className="card flex max-h-[85dvh] w-full max-w-2xl flex-col gap-3 overflow-y-auto p-5"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-label="How to play"
            >
              <div className="flex items-center justify-between">
                <h2 className="font-display text-3xl">How to play</h2>
                <button className="btn-ghost min-h-11 min-w-9 px-1 sm:min-w-11 sm:px-2" aria-label="Close" onClick={() => setOpen(false)}>
                  <X />
                </button>
              </div>
              {meta && (
                <div className="flex rounded-2xl bg-bg-2 p-1">
                  {(["game", "board"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTab(t)}
                      className={`min-h-11 flex-1 rounded-xl font-display ${tab === t ? "bg-accent text-[#241a00]" : "text-muted"}`}
                    >
                      {t === "game" ? localize(meta.name) : "Board game"}
                    </button>
                  ))}
                </div>
              )}
              {meta && tab === "game" ? <MinigameTutorial id={meta.id} /> : <BoardRules />}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
