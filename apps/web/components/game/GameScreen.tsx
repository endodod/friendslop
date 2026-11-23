"use client";
import { AnimatePresence, motion } from "framer-motion";
import { ChatPanel } from "../ChatPanel";
import { Flag, LogOut, Map as MapIcon, MoreHorizontal, Pause, Play, X } from "lucide-react";
import { setGamePaused } from "@party-game/minigames/client";
import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { useBoard } from "@/lib/board";
import { act } from "@/lib/useRoom";
import { BoardView } from "../board/BoardView";
import { QuestionView } from "../question/QuestionView";
import { MinigameView } from "../minigame/MinigameView";
import { useScreenShake } from "../fx";
import { Avatar, CoinCount, Icon, MuteButton, StarCount, useIsHost, usePlayers } from "../ui";
import { BonusStarsView, GameEndBanner, Podium } from "./EndScreens";
import { GameStartPanel, PhasePanel, SkipButton } from "./PhasePanel";
import { HelpButton } from "./HowToPlay";
import { Scoreboard, ScoreStrip } from "./Scoreboard";

const FOCUS_PHASES = new Set([
  "gameStart",
  "questionRound",
  "minigameIntro",
  "minigameQuestion",
  "minigameCountdown",
  "minigamePlaying",
  "minigameResults",
  "gameEnd",
  "bonusStars",
  "podium",
]);

function useIsWide() {
  const [wide, setWide] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return wide;
}

/** Big content shown instead of (or over) the board: questions, mini-games, end screens. */
function FocusContent({ display }: { display: boolean }) {
  const g = useStore((s) => s.pub!.game!);
  switch (g.phase) {
    case "gameStart":
      return g.mode === "board" ? <GameStartPanel /> : <p className="py-10 text-center font-display text-3xl">Get ready…</p>;
    case "questionRound":
      return g.question ? (
        <>
          <QuestionView round={g.question} display={display} />
          {g.question.stage !== "answering" && <SkipButton />}
        </>
      ) : null;
    case "minigameIntro":
    case "minigameQuestion":
    case "minigameCountdown":
    case "minigamePlaying":
    case "minigameResults":
      return <MinigameView display={display} />;
    case "gameEnd":
      return <GameEndBanner />;
    case "bonusStars":
      return <BonusStarsView game={g} />;
    case "podium":
      return <Podium game={g} />;
    default:
      return null;
  }
}

/** Who plays now and who's next (this round, then the next round from the top). */
function TurnOrder() {
  const g = useStore((s) => s.pub!.game!);
  const players = usePlayers();
  const n = g.order.length;
  if (n < 2) return null;
  // Rest of this round first; the ↻ marks where the next round (after the mini-game) starts.
  const upcoming = Array.from({ length: n }, (_, k) => (g.activeIndex + k) % n);
  return (
    <ol className="flex shrink-0 items-center gap-1" aria-label="Turn order">
      {upcoming.map((idx, k) => {
        const p = players[g.order[idx]];
        if (!p) return null;
        const newRound = k > 0 && idx === 0;
        return (
          <li key={p.id} className="flex items-center gap-1" title={k === 0 ? `${p.name} (now)` : `${p.name}${k === 1 ? " (next)" : ""}`}>
            {k > 0 && (
              <span className="text-xs text-muted" aria-hidden>
                {newRound ? "↻" : "›"}
              </span>
            )}
            <span className="sr-only">{k === 0 ? "Now: " : newRound ? "Next round: " : ""}{p.name}</span>
            <Avatar player={p} size={k === 0 ? 28 : 22} ring={k === 0} dim={k > 1} />
          </li>
        );
      })}
    </ol>
  );
}

function TopBar({ compact }: { compact?: boolean }) {
  const pub = useStore((s) => s.pub!);
  const g = useStore((s) => s.pub!.game!);
  const playerId = useStore((s) => s.playerId);
  const isHost = useIsHost();
  const players = usePlayers();
  const me = playerId ? g.players[playerId] : null;
  const active = players[g.order[g.activeIndex]];
  return (
    <header className="flex flex-col">
    <div className={`grid items-center gap-1 px-2 py-2 sm:gap-3 sm:px-3 ${compact ? "grid-cols-[1fr_auto]" : "grid-cols-[1fr_minmax(0,auto)_1fr]"}`}>
      <div className="flex min-w-0 items-center gap-1 sm:gap-3">
      <span className="min-w-0 truncate whitespace-nowrap rounded-xl bg-panel-2 px-2 py-1 font-display sm:px-3">
        {g.mode === "questionDebug" ? "Questions" : g.mode === "minigameDebug" ? "Practice" : g.turnCount > 0 ? `Round ${g.round}/${g.turnCount}` : `Round ${g.round}`}
      </span>
      {g.mode === "board" && (pub.settings.starGoal ?? 0) > 0 && (
        <span className="rounded-xl bg-[#ffe066]/15 px-2 py-1 font-display text-sm text-[#ffe066]">First to {pub.settings.starGoal} ★</span>
      )}
      {!compact && g.mode === "board" && active && !FOCUS_PHASES.has(g.phase) && (
        <span className="truncate font-display text-muted">{active.name}&apos;s turn</span>
      )}
      {!compact && g.mode === "board" && g.phase !== "podium" && <TurnOrder />}
      </div>
      {!compact && <LastAction />}
      <div className="flex items-center justify-end gap-1 sm:gap-3">
      {me && (
        <span className="flex items-center gap-2 rounded-xl bg-panel-2 px-2 py-1 sm:gap-3 sm:px-3">
          <StarCount value={me.stars} size={18} />
          <CoinCount value={me.coins} size={18} />
        </span>
      )}
      <HelpButton minigameId={g.minigame?.id ?? null} />
      <MuteButton />
      {!compact && isHost && g.mode === "board" && !["gameEnd", "bonusStars", "podium"].includes(g.phase) && (
        <button
          className="btn-ghost min-h-11 min-w-9 px-1 sm:min-w-11 sm:px-2"
          aria-label="Finish the game now and show the results"
          title="Finish game"
          data-testid="finish-button"
          onClick={() => {
            if (confirm("Finish the game now? Bonus stars are handed out and the winner is crowned.")) act("game:finish", {});
          }}
        >
          <Flag size={20} />
        </button>
      )}
      {isHost && g.phase !== "podium" && (
        <button
          className="btn-ghost min-h-11 min-w-9 px-1 sm:min-w-11 sm:px-2"
          aria-label={g.pause ? "Resume the game" : "Pause the game for everyone"}
          title={g.pause ? "Resume" : "Pause"}
          data-testid="pause-button"
          onClick={() => act("game:pause", { paused: !g.pause })}
        >
          {g.pause ? <Play size={20} /> : <Pause size={20} />}
        </button>
      )}
      {compact && isHost && g.phase !== "podium" && <HostMenu canFinish={g.mode === "board" && !["gameEnd", "bonusStars"].includes(g.phase)} />}
      {!compact && isHost && g.phase !== "podium" && (
        <button
          className="btn-ghost min-h-11 min-w-9 px-1 sm:min-w-11 sm:px-2"
          aria-label="End game and return to lobby"
          onClick={() => {
            if (confirm("End the game for everyone and go back to the lobby?")) act("game:abort", {});
          }}
        >
          <LogOut size={20} />
        </button>
      )}
      </div>
    </div>
    {compact && (
      <div className="mx-2 mb-2 flex min-w-0 items-center gap-2">
        {g.mode === "board" && g.phase !== "podium" && <TurnOrder />}
        <LastAction className="min-w-0 flex-1" />
      </div>
    )}
    </header>
  );
}

/** Phones: the host's rarely used buttons (finish now, end the game) live in a small menu. */
function HostMenu({ canFinish }: { canFinish: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        className="btn-ghost min-h-11 min-w-9 px-1"
        aria-label="More host options"
        aria-expanded={open}
        data-testid="host-menu"
        onClick={() => setOpen((o) => !o)}
      >
        <MoreHorizontal size={20} />
      </button>
      {open && (
        <>
          <button className="fixed inset-0 z-[60] cursor-default" aria-label="Close menu" onClick={() => setOpen(false)} />
          <div className="card absolute right-0 top-12 z-[61] flex w-64 flex-col gap-1 p-2 shadow-xl" role="menu">
            {canFinish && (
              <button
                role="menuitem"
                className="btn-ghost min-h-11 justify-start"
                data-testid="finish-button"
                onClick={() => {
                  setOpen(false);
                  if (confirm("Finish the game now? Bonus stars are handed out and the winner is crowned.")) act("game:finish", {});
                }}
              >
                <Flag size={18} /> Finish game now
              </button>
            )}
            <button
              role="menuitem"
              className="btn-ghost min-h-11 justify-start"
              onClick={() => {
                setOpen(false);
                if (confirm("End the game for everyone and go back to the lobby?")) act("game:abort", {});
              }}
            >
              <LogOut size={18} /> End game (back to lobby)
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** The most recent item use, item buy or star buy, centered in the top bar. */
function LastAction({ className = "" }: { className?: string }) {
  const entry = useStore((s) => {
    const log = s.pub?.game?.log ?? [];
    for (let i = log.length - 1; i >= 0; i--) if (log[i].kind) return log[i];
    return null;
  });
  const players = usePlayers();
  if (!entry) return <span className={className} />;
  const p = entry.playerId ? players[entry.playerId] : undefined;
  return (
    <div className={`flex min-w-0 justify-center ${className}`} aria-live="polite" data-testid="last-action">
      <AnimatePresence mode="wait">
        <motion.span
          key={entry.at + entry.text}
          initial={{ y: -10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 10, opacity: 0 }}
          className="flex min-w-0 max-w-full items-center gap-2 rounded-xl bg-panel-2 px-3 py-1 text-sm"
          title={entry.text}
        >
          {entry.kind === "star" ? (
            <Icon id="star" size={16} className="shrink-0 text-[#ffe066]" />
          ) : p ? (
            <Avatar player={p} size={20} />
          ) : null}
          <span className="truncate">{entry.text}</span>
        </motion.span>
      </AnimatePresence>
    </div>
  );
}

/** Everyone sees this while the host has paused; the host can resume from it. */
function PauseOverlay() {
  const pause = useStore((s) => s.pub?.game?.pause ?? null);
  const isHost = useIsHost();
  const players = usePlayers();
  // Solo mini-games keep their own clocks on each phone: freeze those too.
  useEffect(() => setGamePaused(!!pause), [pause]);
  useEffect(() => () => setGamePaused(false), []);
  const by = pause?.by ? players[pause.by] : undefined;
  return (
    <AnimatePresence>
      {pause && (
        <motion.div
          key="pause"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[90] flex items-center justify-center bg-bg/80 p-6 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
          aria-label="Game paused"
          data-testid="pause-overlay"
        >
          <motion.div
            initial={{ scale: 0.85, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            className="card flex w-full max-w-sm flex-col items-center gap-4 p-8 text-center"
          >
            <motion.span
              animate={{ opacity: [1, 0.4, 1] }}
              transition={{ repeat: Infinity, duration: 1.6 }}
              className="flex h-20 w-20 items-center justify-center rounded-full bg-accent/20 text-accent ring-2 ring-accent"
            >
              <Pause size={40} />
            </motion.span>
            <h2 className="font-display text-4xl">Paused</h2>
            <p className="text-muted">
              {by ? `${by.name} paused the game.` : "The host paused the game."} All timers are stopped.
            </p>
            {isHost ? (
              <button className="btn-primary min-h-14 w-full text-2xl" data-testid="resume-button" onClick={() => act("game:pause", { paused: false })}>
                <Play size={22} /> Resume
              </button>
            ) : (
              <p className="font-display text-lg">Waiting for the host to resume…</p>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function GameScreen() {
  return (
    <>
      <GameScreenInner />
      <PauseOverlay />
    </>
  );
}

function GameScreenInner() {
  const pub = useStore((s) => s.pub!);
  const role = useStore((s) => s.role);
  const playerId = useStore((s) => s.playerId);
  const g = pub.game!;
  const board = useBoard(g.boardId);
  const players = usePlayers();
  const wide = useIsWide();
  const shakeRef = useScreenShake(playerId);
  const [showBoard, setShowBoard] = useState(false);

  const display = role === "display";
  // Let a token finish walking (and land) before a full-screen phase hides the board.
  const boardBusy = useStore((s) => s.boardBusy);
  const focus = g.mode !== "board" || (FOCUS_PHASES.has(g.phase) && !boardBusy);
  // Phones: the page keeps its scroll position. Coming from a scrolled-down lobby, or when a question or
  // mini-game takes over, jump back to the top so the top bar and the new content are in view.
  const focusPhase = focus ? g.phase : null;
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [focus, focusPhase]);
  const controllerMode = !display && pub.displays > 0; // same room: phones are controllers
  const myTurn = playerId === g.order[g.activeIndex];
  const selectable = g.phase === "junctionChoice" && myTurn && !display ? (g.junction?.options ?? []) : [];

  const makeBoard = (withPlayers: boolean) =>
    board ? (
      <BoardView
        board={board}
        game={g}
        players={players}
        follow={!display && !wide}
        selectable={selectable}
        onSelect={(tileId) => act("turn:chooseDirection", { tileId })}
        header={withPlayers && g.mode === "board" ? <ScoreStrip game={g} /> : undefined}
      />
    ) : (
      <div className="flex h-full items-center justify-center text-muted">Loading board…</div>
    );
  const boardEl = makeBoard(false);

  // ---------------- Shared display (TV): board always visible, focus content as an overlay
  if (display) {
    return (
      <main ref={shakeRef} className="flex h-dvh flex-col">
        <TopBar />
        <div className="grid min-h-0 flex-1 grid-cols-[1fr_340px] gap-4 px-4 pb-4">
          <div className="relative min-h-0 rounded-3xl bg-bg-2/60">
            {g.mode === "board" && makeBoard(!focus)}
            <AnimatePresence>
              {focus && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 overflow-y-auto rounded-3xl bg-bg/85 p-6 backdrop-blur-sm"
                >
                  <div className="mx-auto max-w-4xl">
                    <FocusContent display />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <aside className="grid min-h-0 grid-rows-[minmax(0,3fr)_minmax(0,2fr)] gap-4">
            <section className="card min-h-0 overflow-y-auto p-4">
              {focus || g.mode !== "board" ? <Scoreboard game={g} /> : <PhasePanel board={board} display />}
            </section>
            <ChatPanel height="h-full" />
          </aside>
        </div>
      </main>
    );
  }

  // ---------------- Player
  const panel = focus ? <FocusContent display={false} /> : <PhasePanel board={board} />;

  if (controllerMode) {
    return (
      <main ref={shakeRef} className="mx-auto flex min-h-dvh max-w-xl flex-col">
        <TopBar compact />
        <div className="flex flex-1 flex-col gap-4 px-3 pb-6">
          {!focus && <Scoreboard game={g} compact />}
          <section className="card p-4">{panel}</section>
          {g.mode === "board" && !focus && (
            <button className="btn-ghost" onClick={() => setShowBoard(true)}>
              <MapIcon size={18} /> Show board
            </button>
          )}
          <ChatPanel />
        </div>
        <AnimatePresence>
          {showBoard && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex flex-col bg-bg/95 p-3"
            >
              <button className="btn-secondary self-end" onClick={() => setShowBoard(false)} aria-label="Close board">
                <X />
              </button>
              <div className="min-h-0 flex-1">{boardEl}</div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    );
  }

  // Online mode: everyone sees board + their controls.
  if (wide) {
    return (
      <main ref={shakeRef} className="flex h-dvh flex-col">
        <TopBar />
        <div className="grid min-h-0 flex-1 grid-cols-[1fr_400px] gap-4 px-4 pb-4">
          <div className="relative min-h-0 overflow-y-auto rounded-3xl bg-bg-2/60">
            {focus ? (
              <div className="mx-auto max-w-3xl p-6">
                <FocusContent display={false} />
              </div>
            ) : (
              makeBoard(true)
            )}
          </div>
          {/* Fixed split: the turn panel (dice, shop, star…) never grows; it scrolls inside. */}
          <aside className="grid min-h-0 grid-rows-[minmax(0,3fr)_minmax(0,2fr)] gap-4">
            <section className="card min-h-0 overflow-y-auto p-4">{focus ? <Scoreboard game={g} compact /> : panel}</section>
            <ChatPanel height="h-full" />
          </aside>
        </div>
      </main>
    );
  }

  return (
    <main ref={shakeRef} className="flex min-h-dvh flex-col">
      <TopBar compact />
      {g.mode === "board" && !focus && <div className="h-[42dvh] shrink-0 px-2">{boardEl}</div>}
      <div className="flex flex-1 flex-col gap-3 px-3 pb-6">
        <section className="card p-4">{panel}</section>
        {!focus && <Scoreboard game={g} compact />}
        <ChatPanel />
      </div>
    </main>
  );
}
