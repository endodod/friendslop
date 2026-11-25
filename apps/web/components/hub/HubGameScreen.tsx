"use client";
import { motion } from "framer-motion";
import { FastForward, LogOut, MoreHorizontal, Pause, Play } from "lucide-react";
import { useEffect, useState } from "react";
import { gameInfo, type BluffPublic, type HubGameId, type SpectrumPublic, type SpyPublic } from "@party-game/shared";
import { useStore } from "@/lib/store";
import { act } from "@/lib/useRoom";
import { ChatPanel } from "../ChatPanel";
import { MuteButton, useIsHost } from "../ui";
import { PauseOverlay } from "../game/GameScreen";
import { GameBadge, HubHelpButton, HubIntro, useHub } from "./common";
import { HubPodium } from "./HubPodium";
import { SpyGridIntroTeams, SpyGridSide, SpyGridView } from "./SpyGridView";
import { SpectrumView } from "./SpectrumView";
import { BluffView } from "./BluffView";
import { ScoreList } from "./ScoreList";

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

/** Short status for the top bar: "Round 3/8", "Foxes' turn"… */
function useStatus(): string {
  const hub = useHub();
  if (hub.stage === "intro") return "How to play";
  if (hub.stage === "podium") return "Results";
  switch (hub.gameId as HubGameId) {
    case "spygrid": {
      const s = hub.state as SpyPublic;
      return `Turn ${s.turnNumber}`;
    }
    case "spectrum": {
      const s = hub.state as SpectrumPublic;
      return `Round ${Math.min(s.totalRounds, (s.round?.index ?? s.history.length) + 1)}/${s.totalRounds}`;
    }
    case "bluff": {
      const s = hub.state as BluffPublic;
      return `Round ${Math.min(s.totalRounds, (s.round?.index ?? s.history.length) + 1)}/${s.totalRounds}`;
    }
  }
}

function TopBar({ compact }: { compact?: boolean }) {
  const hub = useHub();
  const isHost = useIsHost();
  const info = gameInfo(hub.gameId);
  const status = useStatus();
  return (
    <header className="flex items-center justify-between gap-2 px-2 py-2 sm:px-3">
      <div className="flex min-w-0 items-center gap-2">
        <GameBadge info={info} size={compact ? "sm" : "md"} />
        <span className="truncate whitespace-nowrap rounded-xl bg-panel-2 px-2 py-1 font-display sm:px-3" data-testid="hub-status">
          {status}
        </span>
      </div>
      <div className="flex items-center justify-end gap-1 sm:gap-3">
        <HubHelpButton id={hub.gameId as HubGameId} />
        <MuteButton />
        {isHost && hub.stage !== "podium" && (
          <button
            className="btn-ghost min-h-11 min-w-9 px-1 sm:min-w-11 sm:px-2"
            aria-label={hub.pause ? "Resume the game" : "Pause the game for everyone"}
            title={hub.pause ? "Resume" : "Pause"}
            data-testid="pause-button"
            onClick={() => act("game:pause", { paused: !hub.pause })}
          >
            {hub.pause ? <Play size={20} /> : <Pause size={20} />}
          </button>
        )}
        {isHost && hub.stage !== "podium" && <HostMenu />}
      </div>
    </header>
  );
}

function HostMenu() {
  const [open, setOpen] = useState(false);
  const hub = useHub();
  const spy = hub.gameId === "spygrid" && hub.stage === "playing" ? (hub.state as SpyPublic) : null;
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
            {spy && (spy.phase === "clue" || spy.phase === "guess") && (
              <button
                role="menuitem"
                className="btn-ghost min-h-11 justify-start"
                onClick={() => {
                  setOpen(false);
                  if (confirm("End this team's turn now?")) act("game:continue", {});
                }}
              >
                <FastForward size={18} /> End this turn
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

/** The game itself. `display`: the shared TV view. `controller`: a phone next to a TV (controls only). */
function GameView({ display, controller }: { display: boolean; controller: boolean }) {
  const hub = useHub();
  const id = hub.gameId as HubGameId;
  if (hub.stage === "intro") return <HubIntro extra={id === "spygrid" ? <SpyGridIntroTeams /> : undefined} />;
  if (hub.stage === "podium") return <HubPodium />;
  switch (id) {
    case "spygrid":
      return <SpyGridView display={display} controller={controller} />;
    case "spectrum":
      return <SpectrumView display={display} controller={controller} />;
    case "bluff":
      return <BluffView display={display} controller={controller} />;
  }
}

function Side() {
  const hub = useHub();
  if (hub.gameId === "spygrid") return <SpyGridSide />;
  return <ScoreList />;
}

export function HubGameScreen() {
  return (
    <>
      <HubGameScreenInner />
      <PauseOverlay />
    </>
  );
}

function HubGameScreenInner() {
  const pub = useStore((s) => s.pub!);
  const role = useStore((s) => s.role);
  const hub = pub.hub!;
  const wide = useIsWide();
  const display = role === "display";
  const controller = !display && pub.displays > 0;
  // Each new screen starts at the top on phones.
  const key = `${hub.stage}-${(hub.state as { phase?: string }).phase ?? ""}`;
  useEffect(() => {
    if (!wide) window.scrollTo({ top: 0 });
  }, [key, wide]);

  // No exit animation here: an exiting copy would re-render from the live store and mount the next
  // screen twice (losing anything typed into it).
  const view = (
    <motion.div key={hub.stage} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <GameView display={display} controller={controller} />
    </motion.div>
  );

  if (display || (wide && !controller)) {
    return (
      <main className="flex h-dvh flex-col">
        <TopBar />
        <div className={`grid min-h-0 flex-1 gap-4 px-4 pb-4 ${display ? "grid-cols-[1fr_340px]" : "grid-cols-[1fr_380px]"}`}>
          <div className="min-h-0 overflow-y-auto rounded-3xl bg-bg-2/60 p-4 sm:p-6">
            <div className="mx-auto max-w-5xl">{view}</div>
          </div>
          <aside className="grid min-h-0 grid-rows-[minmax(0,3fr)_minmax(0,2fr)] gap-4">
            <section className="card min-h-0 overflow-y-auto p-4">
              <Side />
            </section>
            <ChatPanel height="h-full" />
          </aside>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col">
      <TopBar compact />
      <div className="flex flex-1 flex-col gap-3 px-3 pb-6">
        <section className="card p-4">{view}</section>
        {hub.stage === "playing" && (
          <section className="card p-4">
            <Side />
          </section>
        )}
        <ChatPanel />
      </div>
    </main>
  );
}
