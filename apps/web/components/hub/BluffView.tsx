"use client";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Home, Pencil, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { BLUFF, type BluffPrivate, type BluffPublic } from "@party-game/shared";
import { useStore } from "@/lib/store";
import { play } from "@/lib/sfx";
import { Avatar, Icon, PlayerName, Timer, usePlayers } from "../ui";
import { Confetti } from "../fx";
import { HubSkip, Splash, chunky, hubAct, useHubPriv, useHubState } from "./common";

/** Same colors as the board game's answer tiles. */
const TILE_COLORS = ["#3d8bff", "#ff4d5e", "#2fd27a", "#e0a400", "#b26bff", "#ff8a3d"];
const TILE_SHAPES = ["▲", "●", "■", "◆", "★", "✚"];

type Round = NonNullable<BluffPublic["round"]>;

function Prompt({ r, display }: { r: Round; display: boolean }) {
  const players = usePlayers();
  return (
    <div
      className="relative flex flex-col items-center gap-3 overflow-hidden rounded-3xl px-4 pb-5 pt-4 text-center"
      style={{ background: "radial-gradient(60% 90% at 50% 0%, #ff6bc644 0%, transparent 70%), #ffffff08", boxShadow: "inset 0 0 0 2px #ff6bc655" }}
      data-testid="bluff-prompt"
    >
      <span aria-hidden className="pointer-events-none absolute -top-10 left-1/2 h-40 w-56 -translate-x-1/2 rounded-full bg-[#fff6] opacity-20 blur-2xl" />
      <span className="relative flex items-center gap-2 rounded-full py-1 pl-1 pr-3 font-display text-[#14112a]" style={chunky("#ff6bc6", { depth: 3 })}>
        <span className="anim-float">
          <Avatar player={players[r.targetId]} size={30} ring />
        </span>
        In the spotlight: {players[r.targetId]?.name}
      </span>
      <h2 className={`relative font-display leading-tight drop-shadow-[0_3px_0_#0008] ${display ? "text-5xl" : "text-3xl sm:text-4xl"}`}>{r.prompt}</h2>
    </div>
  );
}

function WriteForm({ r }: { r: Round }) {
  const priv = useHubPriv<BluffPrivate>();
  const playerId = useStore((s) => s.playerId);
  const players = usePlayers();
  const isTarget = playerId === r.targetId;
  const [text, setText] = useState("");
  const [editing, setEditing] = useState(false);
  const mine = priv?.mine ?? null;
  if (mine && !editing)
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl bg-bg-2 p-4 text-center">
        <span className="flex items-center gap-2 text-sm text-muted">
          <Check size={16} className="text-good" /> {isTarget ? "Your real answer" : "Your fake"}
        </span>
        <span className="font-display text-2xl">{mine}</span>
        <button
          className="btn-ghost min-h-11 text-sm"
          onClick={() => {
            setText(mine);
            setEditing(true);
          }}
        >
          <Pencil size={14} /> Change it
        </button>
        <span className="text-sm text-muted">Waiting for the others…</span>
      </div>
    );
  return (
    <form
      className={`flex flex-col gap-2 rounded-2xl p-3 ring-2 ${isTarget ? "bg-[#ff6bc6]/10 ring-[#ff6bc6]" : "bg-accent/10 ring-accent"}`}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!text.trim()) return;
        const res = await hubAct({ type: "write", text: text.trim() });
        if (res.ok) setEditing(false);
      }}
      data-testid="bluff-write"
    >
      <p className="font-display text-xl">{isTarget ? "It's about you! Write your real answer." : `Write a fake answer ${players[r.targetId]?.name} might give.`}</p>
      <p className="text-sm text-muted">
        {isTarget
          ? "Be honest: your friends score by finding it, and you get a point for each one who does."
          : "Make it believable. Every friend who picks your fake gives you +2."}{" "}
        All answers are shown in lowercase without punctuation, so nobody can tell them apart by style.
      </p>
      <div className="flex gap-2">
        <input
          className="input min-w-0 flex-1"
          value={text}
          maxLength={BLUFF.answerMaxLength}
          placeholder={isTarget ? "The truth…" : "A convincing lie…"}
          aria-label={isTarget ? "Your real answer" : "Your fake answer"}
          autoComplete="off"
          autoFocus
          onChange={(e) => setText(e.target.value)}
        />
        <button className="btn-primary shrink-0" disabled={!text.trim()}>
          <Send size={18} /> Send
        </button>
      </div>
    </form>
  );
}

function VoteList({ r, display }: { r: Round; display: boolean }) {
  const priv = useHubPriv<BluffPrivate>();
  const playerId = useStore((s) => s.playerId);
  const players = usePlayers();
  const isTarget = playerId === r.targetId;
  const canVote = !display && !!playerId && !isTarget && !priv?.mindReader && !priv?.myVote && r.voted.indexOf(playerId) < 0;
  const voted = priv?.myVote ?? null;
  return (
    <div className="flex flex-col gap-3" data-testid="bluff-vote">
      {!display && (
        <p className="text-center font-display text-lg text-muted">
          {isTarget
            ? "Your friends are hunting for your real answer…"
            : priv?.mindReader
              ? "You wrote the real answer! +3. Sit back and watch."
              : voted
                ? "Picked! Tap 😂 on the funniest fake if you like."
                : `Which one is ${players[r.targetId]?.name}'s real answer?`}
        </p>
      )}
      <ul className={`grid gap-3 ${display ? "sm:grid-cols-2" : ""}`}>
        {r.entries.map((e, i) => {
          const own = priv?.myEntryId === e.id;
          const laughed = priv?.myLaugh === e.id;
          return (
            <motion.li
              key={e.id}
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: i * 0.06 }}
              className="flex items-stretch gap-2"
            >
              <motion.button
                whileTap={canVote && !own ? { scale: 0.96 } : undefined}
                className={`flex min-h-16 min-w-0 flex-1 items-center gap-3 rounded-2xl px-4 py-2 text-left font-display text-xl leading-tight text-white transition-[filter,opacity] ${
                  canVote && !own ? "cursor-pointer hover:brightness-110" : "cursor-default"
                } ${display ? "text-3xl" : ""}`}
                style={{
                  ...chunky(TILE_COLORS[i % 6]),
                  ...(voted === e.id ? { boxShadow: "0 0 0 4px #0d0b1a, 0 0 0 8px #fff" } : {}),
                  opacity: own || (voted && voted !== e.id) ? 0.5 : 1,
                }}
                disabled={!canVote || own}
                onClick={() => hubAct({ type: "vote", entryId: e.id })}
                data-testid="bluff-entry"
              >
                <span aria-hidden className="text-2xl opacity-70">{TILE_SHAPES[i % 6]}</span>
                <span className="min-w-0 flex-1 break-words drop-shadow-[0_2px_0_#0004]">{e.text}</span>
                {own && <span className="shrink-0 rounded-full bg-[#0005] px-2 text-xs">yours</span>}
                {voted === e.id && <Check className="shrink-0" strokeWidth={3} />}
              </motion.button>
              {!display && !isTarget && !own && (
                <button
                  className={`w-14 shrink-0 rounded-2xl text-2xl transition-transform active:translate-y-1 ${laughed ? "" : "grayscale"}`}
                  style={chunky(laughed ? "#ffc933" : "#3a3462", { depth: 4 })}
                  aria-label={laughed ? "Take back your laugh" : "Funniest answer"}
                  aria-pressed={laughed}
                  onClick={() => hubAct({ type: "laugh", entryId: laughed ? null : e.id })}
                >
                  😂
                </button>
              )}
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}

/** Answers one by one: the fakes people fell for, then the truth. */
function Reveal({ r, display }: { r: Round; display: boolean }) {
  const players = usePlayers();
  const votes = r.votes ?? {};
  const laughs = r.laughs ?? {};
  const votersOf = (id: string) => Object.keys(votes).filter((p) => votes[p] === id);
  const laughsOf = (id: string) => Object.keys(laughs).filter((p) => laughs[p] === id).length;
  const fakes = r.entries.filter((e) => !e.truth && votersOf(e.id).length > 0).sort((a, b) => votersOf(a.id).length - votersOf(b.id).length);
  const truth = r.entries.find((e) => e.truth)!;
  const order = [...fakes, truth];
  const [shown, setShown] = useState(1);
  useEffect(() => {
    if (shown >= order.length) return;
    const t = setTimeout(() => setShown((n) => n + 1), BLUFF.revealPerEntryMs);
    return () => clearTimeout(t);
  }, [shown, order.length]);
  const truthShown = shown >= order.length;
  useEffect(() => {
    play(truthShown ? "reveal" : "pop");
  }, [shown, truthShown]);
  const unpicked = r.entries.filter((e) => !e.truth && votersOf(e.id).length === 0);
  return (
    <div className="flex flex-col gap-3" data-testid="bluff-reveal">
      <Confetti fireKey={truthShown ? `truth-${r.index}` : null} count={40} />
      <AnimatePresence>
        {order.slice(0, shown).map((e) => {
          const voters = votersOf(e.id);
          const lol = laughsOf(e.id);
          return (
            <motion.div
              key={e.id}
              layout
              initial={{ rotateX: 90, opacity: 0, scale: 0.9 }}
              animate={{ rotateX: 0, opacity: 1, scale: 1 }}
              transition={{ type: "spring", stiffness: 160, damping: 15 }}
              className="relative flex flex-col gap-2 overflow-hidden rounded-2xl p-4"
              style={e.truth ? { ...chunky("#2fd27a"), color: "#06210f" } : chunky("#3a3462")}
            >
              <motion.span
                aria-hidden
                initial={{ scale: 3, opacity: 0, rotate: -30 }}
                animate={{ scale: 1, opacity: 1, rotate: e.truth ? -8 : 10 }}
                transition={{ delay: 0.45, type: "spring", stiffness: 260, damping: 14 }}
                className={`pointer-events-none absolute right-3 top-2 rounded-lg border-[3px] px-2 font-display text-xl tracking-wider ${
                  e.truth ? "border-[#06210f] text-[#06210f]" : "border-bad text-bad"
                }`}
              >
                {e.truth ? "TRUTH" : "LIE"}
              </motion.span>
              <div className="flex flex-wrap items-center justify-between gap-2 pr-20">
                <span className={`font-display drop-shadow-[0_2px_0_#0003] ${display ? "text-3xl" : "text-2xl"}`}>{e.text}</span>
                {e.truth ? (
                  <span className="font-display text-sm">{"It's"} the real answer!</span>
                ) : e.house ? (
                  <span className="flex items-center gap-1 rounded-full bg-panel-2 px-3 py-0.5 text-sm">
                    <Home size={14} /> House lie
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-sm text-muted">
                    Lie by{" "}
                    {(e.authors ?? []).map((a) => (
                      <span key={a} className="flex items-center gap-1">
                        <Avatar player={players[a]} size={22} /> <PlayerName player={players[a]} />
                      </span>
                    ))}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                {voters.length ? (
                  <>
                    <span className={e.truth ? "" : "text-muted"}>{e.truth ? "Found by" : "Fooled"}</span>
                    {voters.map((v) => (
                      <Avatar key={v} player={players[v]} size={26} />
                    ))}
                    {!e.truth && !e.house && <span className="font-display text-good">+{voters.length * BLUFF.points.fooled}</span>}
                  </>
                ) : (
                  e.truth && <span>Nobody found it!</span>
                )}
                {lol > 0 && <span className="ml-auto">😂 ×{lol}</span>}
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
      {truthShown && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-2">
          {r.mindReaders.length > 0 && (
            <p className="flex flex-wrap items-center gap-2 rounded-2xl bg-accent/15 p-3 text-sm">
              <Icon id="mind-reader" size={20} className="text-accent" />
              Mind reader{r.mindReaders.length > 1 ? "s" : ""}:{" "}
              {r.mindReaders.map((p) => (
                <PlayerName key={p} player={players[p]} />
              ))}{" "}
              wrote the real answer (+{BLUFF.points.mindReader}).
            </p>
          )}
          {unpicked.length > 0 && (
            <details className="rounded-2xl bg-bg-2 p-3 text-sm">
              <summary className="cursor-pointer text-muted">Nobody fell for {unpicked.length} other answer{unpicked.length > 1 ? "s" : ""}</summary>
              <ul className="mt-2 flex flex-col gap-1">
                {unpicked.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center gap-2">
                    <span className="font-display">{e.text}</span> <span className="text-muted">{e.house ? "(house lie)" : `by ${(e.authors ?? []).map((a) => players[a]?.name).join(" & ")}`}</span>
                    {laughsOf(e.id) > 0 && <span>😂 ×{laughsOf(e.id)}</span>}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <HubSkip label="Next round" />
        </motion.div>
      )}
    </div>
  );
}

export function BluffView({ display }: { display: boolean; controller?: boolean }) {
  const s = useHubState<BluffPublic>();
  const playerId = useStore((st) => st.playerId);
  const players = usePlayers();
  const r = s.round;
  if (!r) return <p className="py-10 text-center font-display text-3xl">Get ready…</p>;
  const total = s.phaseEndsAt ? s.phaseEndsAt - s.phaseStartedAt : 0;
  const inGame = !!playerId && s.players.includes(playerId);
  return (
    <div className="flex flex-col gap-4" data-testid="bluff">
      {s.phase === "write" && (
        <Splash id={`write-${r.index}`} color="#ff6bc6" sub={`All about ${players[r.targetId]?.name ?? "?"}!`}>
          Round {r.index + 1}
        </Splash>
      )}
      {s.phase === "vote" && (
        <Splash id={`vote-${r.index}`} color="#ffc933">
          Find the truth!
        </Splash>
      )}
      <div className="flex items-center justify-between text-sm text-muted">
        <span>
          Round {r.index + 1}/{s.totalRounds}
        </span>
        <span>{s.phase === "write" ? "Write" : s.phase === "vote" ? "Find the truth" : "Reveal"}</span>
      </div>
      {s.phase !== "reveal" && s.phaseEndsAt && <Timer endsAt={s.phaseEndsAt} totalMs={total} silent={display} />}
      <Prompt r={r} display={display} />
      <AnimatePresence mode="wait">
        <motion.div key={s.phase + r.index} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
          {s.phase === "write" &&
            (display || !inGame ? (
              <p className="text-center font-display text-xl text-muted">
                Everyone is writing… {r.written.length}/{s.players.length}
              </p>
            ) : (
              <WriteForm r={r} />
            ))}
          {s.phase === "vote" && <VoteList r={r} display={display || !inGame} />}
          {s.phase === "reveal" && <Reveal r={r} display={display} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
