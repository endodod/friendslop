"use client";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Send } from "lucide-react";
import { useState } from "react";
import { ODDWORD, crewClueProblem, type OddPrivate, type OddPublic } from "@party-game/shared";
import { useStore } from "@/lib/store";
import { Avatar, Icon, PlayerName, Timer, usePlayers } from "../ui";
import { Confetti } from "../fx";
import { HubSkip, hubAct, useHubPriv, useHubState } from "./common";

const RED = "#ff4d5e";
type Round = NonNullable<OddPublic["round"]>;

function MyWord({ word }: { word: string }) {
  return (
    <motion.div
      initial={{ rotateX: 90, opacity: 0 }}
      animate={{ rotateX: 0, opacity: 1 }}
      className="mx-auto flex flex-col items-center rounded-3xl px-6 py-3 text-center shadow-[0_6px_0_#0005]"
      style={{ background: `linear-gradient(160deg, ${RED}, #c92a3a)` }}
      data-testid="odd-word"
    >
      <span className="text-xs uppercase tracking-wider text-white/75">Your word (is it everyone&apos;s?)</span>
      <span className="font-display text-4xl text-white">{word}</span>
    </motion.div>
  );
}

/** Every player's clues so far, in turn order. */
function ClueBoard({ r, laps, display }: { r: Round; laps: number; display: boolean }) {
  const players = usePlayers();
  const byPlayer = (p: string) => r.clues.filter((c) => c.playerId === p);
  return (
    <ul className={`grid gap-2 ${display ? "sm:grid-cols-2" : ""}`} data-testid="odd-clues">
      {r.order.map((p) => {
        const mine = byPlayer(p);
        const turn = r.turnPlayerId === p;
        const accused = r.accusedId === p;
        return (
          <motion.li
            key={p}
            layout
            className={`flex items-center gap-2 rounded-2xl px-3 py-2 ${accused ? "bg-bad/20" : "bg-bg-2"}`}
            // Always set: motion components keep a style value that is removed.
            style={{ boxShadow: turn ? `inset 0 0 0 2px ${RED}` : "inset 0 0 0 0 transparent" }}
          >
            <Avatar player={players[p]} size={display ? 40 : 30} ring={turn} />
            <PlayerName player={players[p]} className="w-20 shrink-0 truncate text-sm" />
            <span className="flex min-w-0 flex-1 flex-wrap gap-1.5">
              {Array.from({ length: laps }, (_, i) => {
                const c = mine[i];
                return (
                  <motion.span
                    key={i}
                    initial={c ? { scale: 0.5, opacity: 0 } : false}
                    animate={{ scale: 1, opacity: 1 }}
                    className={`rounded-lg px-2 py-0.5 font-display ${display ? "text-2xl" : "text-lg"} ${c ? (c.text ? "bg-panel-2" : "bg-panel-2 text-muted") : "border border-dashed border-line text-muted/40"}`}
                  >
                    {c ? (c.text ?? "…") : "?"}
                  </motion.span>
                );
              })}
            </span>
            {turn && <span className="animate-pulse text-xs text-muted">thinking…</span>}
          </motion.li>
        );
      })}
    </ul>
  );
}

function ClueForm({ r, word }: { r: Round; word: string }) {
  const [text, setText] = useState("");
  const problem = text.trim() ? crewClueProblem(text.trim(), word) || (r.clues.some((c) => c.text?.toLowerCase() === text.trim().toLowerCase()) ? "Someone already said that." : "") : "";
  return (
    <form
      className="flex flex-col gap-2 rounded-2xl p-3"
      style={{ background: `${RED}1a`, boxShadow: `inset 0 0 0 2px ${RED}` }}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!text.trim() || problem) return;
        const res = await hubAct({ type: "clue", text: text.trim() });
        if (res.ok) setText("");
      }}
      data-testid="odd-clue-form"
    >
      <p className="font-display text-xl">Your turn! One word about your word.</p>
      <p className="text-sm text-muted">Too obvious helps the odd one out. Too vague and you look suspicious.</p>
      <div className="flex gap-2">
        <input
          className="input min-w-0 flex-1"
          value={text}
          maxLength={ODDWORD.clueMaxLength}
          placeholder="One word…"
          aria-label="Your clue"
          autoComplete="off"
          autoCapitalize="off"
          autoFocus
          onChange={(e) => setText(e.target.value.replace(/\s/g, ""))}
        />
        <button className="btn-primary shrink-0" disabled={!text.trim() || !!problem}>
          <Send size={18} /> Say it
        </button>
      </div>
      {problem && <p className="text-sm font-semibold text-bad">{problem}</p>}
    </form>
  );
}

function VotePanel({ r, players: ids }: { r: Round; players: string[] }) {
  const priv = useHubPriv<OddPrivate>();
  const playerId = useStore((st) => st.playerId);
  const players = usePlayers();
  const mine = priv?.myVote ?? null;
  return (
    <div className="flex flex-col gap-2" data-testid="odd-vote">
      <p className="text-center font-display text-lg">{mine ? "Voted! You can still change it." : "Who has the odd word?"}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {ids
          .filter((p) => p !== playerId)
          .map((p) => (
            <motion.button
              key={p}
              whileTap={{ scale: 0.94 }}
              className={`flex min-h-14 items-center gap-2 rounded-2xl border-2 px-3 py-2 text-left ${mine === p ? "bg-bad/20" : "border-line bg-panel-2 hover:-translate-y-0.5"}`}
              style={{ borderColor: mine === p ? RED : "var(--color-line)" }}
              onClick={() => hubAct({ type: "vote", playerId: p })}
              data-testid="odd-candidate"
            >
              <Avatar player={players[p]} size={32} />
              <PlayerName player={players[p]} className="min-w-0 flex-1 truncate font-display" />
              {mine === p && <Check className="shrink-0 text-bad" />}
            </motion.button>
          ))}
      </div>
      <p className="text-center text-xs text-muted">
        {r.voted.length}/{ids.length} voted
      </p>
    </div>
  );
}

function GuessForm() {
  const [text, setText] = useState("");
  return (
    <form
      className="flex flex-col gap-2 rounded-2xl p-3"
      style={{ background: `${RED}1a`, boxShadow: `inset 0 0 0 2px ${RED}` }}
      onSubmit={async (e) => {
        e.preventDefault();
        if (text.trim()) await hubAct({ type: "guess", text: text.trim() });
      }}
      data-testid="odd-guess-form"
    >
      <p className="font-display text-xl">Caught! But you can still steal the round.</p>
      <p className="text-sm text-muted">What was everyone else&apos;s word? Look at their clues!</p>
      <div className="flex gap-2">
        <input
          className="input min-w-0 flex-1"
          value={text}
          maxLength={ODDWORD.guessMaxLength}
          placeholder="Their word was…"
          aria-label="Your guess"
          autoComplete="off"
          autoFocus
          onChange={(e) => setText(e.target.value)}
        />
        <button className="btn-primary shrink-0" disabled={!text.trim()}>
          <Send size={18} /> Guess
        </button>
      </div>
    </form>
  );
}

function Accusation({ r, display }: { r: Round; display: boolean }) {
  const players = usePlayers();
  const votes = r.votes ?? {};
  const counts: Record<string, string[]> = {};
  for (const [v, t] of Object.entries(votes)) counts[t] = [...(counts[t] ?? []), v];
  const ranked = Object.keys(counts).sort((a, b) => counts[b].length - counts[a].length);
  return (
    <div className="flex flex-col gap-2">
      {ranked.map((t) => (
        <div key={t} className={`flex items-center gap-2 rounded-2xl px-3 py-2 ${t === r.oddId ? "bg-bad/20 ring-2 ring-bad" : "bg-bg-2"}`}>
          <Avatar player={players[t]} size={display ? 40 : 30} />
          <PlayerName player={players[t]} className="min-w-0 flex-1 truncate" />
          <span className="flex -space-x-1.5">
            {counts[t].map((v) => (
              <Avatar key={v} player={players[v]} size={22} />
            ))}
          </span>
          <span className="w-6 text-right font-display text-xl">{counts[t].length}</span>
        </div>
      ))}
    </div>
  );
}

function Result({ r, display }: { r: Round; display: boolean }) {
  const players = usePlayers();
  const odd = r.oddId!;
  const headline = r.caught ? (r.stolen ? "Caught, but stolen!" : "Caught!") : r.accusedId ? "Wrong person!" : "Nobody agreed!";
  const pts = r.points ?? {};
  return (
    <div className="flex flex-col gap-4" data-testid="odd-result">
      <Confetti fireKey={`odd-${r.index}`} count={r.caught && !r.stolen ? 50 : 25} />
      <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 160, damping: 12 }} className="flex flex-col items-center gap-2 text-center">
        <span className={`font-display ${display ? "text-6xl" : "text-4xl"}`} style={{ color: r.caught && !r.stolen ? "var(--color-good)" : RED }}>
          {headline}
        </span>
        <span className="flex items-center gap-2 text-lg">
          <Avatar player={players[odd]} size={display ? 56 : 40} ring />
          <span>
            <PlayerName player={players[odd]} /> was the odd one out
          </span>
        </span>
      </motion.div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col items-center gap-1 rounded-2xl bg-bg-2 p-3 text-center">
          <span className="text-xs uppercase tracking-wider text-muted">Everyone&apos;s word</span>
          <span className={`font-display ${display ? "text-4xl" : "text-2xl"}`}>{r.crowdWord}</span>
        </div>
        <div className="flex flex-col items-center gap-1 rounded-2xl p-3 text-center" style={{ background: `${RED}26` }}>
          <span className="text-xs uppercase tracking-wider text-muted">The odd word</span>
          <span className={`font-display ${display ? "text-4xl" : "text-2xl"}`} style={{ color: RED }}>
            {r.oddWord}
          </span>
        </div>
      </div>
      {r.guess && (
        <p className="text-center text-sm">
          <PlayerName player={players[odd]} /> guessed “<span className="font-display">{r.guess}</span>”{" "}
          {r.stolen ? <span className="text-good">right!</span> : <span className="text-bad">wrong.</span>}
        </p>
      )}
      <Accusation r={r} display={display} />
      <div className="flex flex-wrap justify-center gap-2">
        {Object.entries(pts)
          .filter(([, n]) => n > 0)
          .map(([p, n]) => (
            <span key={p} className="flex items-center gap-1 rounded-full bg-good/15 py-0.5 pl-0.5 pr-2.5">
              <Avatar player={players[p]} size={22} />
              <span className="font-display text-good">+{n}</span>
            </span>
          ))}
      </div>
      <HubSkip label="Next round" />
    </div>
  );
}

export function OddWordView({ display }: { display: boolean; controller?: boolean }) {
  const s = useHubState<OddPublic>();
  const priv = useHubPriv<OddPrivate>();
  const playerId = useStore((st) => st.playerId);
  const players = usePlayers();
  const r = s.round;
  if (!r) return <p className="py-10 text-center font-display text-3xl">Dealing the words…</p>;
  const inGame = !!playerId && s.players.includes(playerId);
  const total = s.phaseEndsAt ? s.phaseEndsAt - s.phaseStartedAt : 0;
  const myTurn = !display && r.turnPlayerId === playerId;
  const word = !display ? (priv?.word ?? null) : null;
  const lap = Math.min(s.laps, Math.floor(r.turn / Math.max(1, r.order.length)) + 1);
  return (
    <div className="flex flex-col gap-4" data-testid="oddword">
      <div className="flex items-center justify-between text-sm text-muted">
        <span>
          Round {r.index + 1}/{s.totalRounds}
        </span>
        <span className="flex items-center gap-1">
          <Icon id="spotlight" size={14} />
          {s.phase === "clue" ? `Clues · lap ${lap}/${s.laps}` : s.phase === "vote" ? "Vote" : s.phase === "lastchance" ? "Last chance" : "Reveal"}
        </span>
      </div>
      {s.phase !== "result" && s.phaseEndsAt && <Timer endsAt={s.phaseEndsAt} totalMs={total} silent={display} />}
      {word && s.phase !== "result" && <MyWord word={word} />}
      <AnimatePresence mode="wait">
        <motion.div key={`${s.phase}-${r.index}-${s.phase === "clue" ? r.turn : ""}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-col gap-4">
          {s.phase === "clue" &&
            (myTurn && word ? (
              <ClueForm r={r} word={word} />
            ) : (
              <p className={`text-center font-display ${display ? "text-4xl" : "text-xl"}`}>
                <PlayerName player={players[r.turnPlayerId ?? ""]} /> <span className="text-muted">is giving a clue…</span>
              </p>
            ))}
          {s.phase === "vote" &&
            (!display && inGame ? (
              <VotePanel r={r} players={s.players} />
            ) : (
              <p className={`text-center font-display text-muted ${display ? "text-4xl" : "text-xl"}`}>
                Who has the odd word? {r.voted.length}/{s.players.length} voted
              </p>
            ))}
          {s.phase === "lastchance" && (
            <>
              {playerId === r.oddId && !display ? (
                <GuessForm />
              ) : (
                <div className="flex flex-col items-center gap-2 text-center">
                  <span className={`font-display text-good ${display ? "text-5xl" : "text-3xl"}`}>Caught!</span>
                  <span className="text-lg">
                    <PlayerName player={players[r.oddId ?? ""]} /> had the odd word, and gets one guess at yours…
                  </span>
                </div>
              )}
              <Accusation r={r} display={display} />
            </>
          )}
          {s.phase === "result" && <Result r={r} display={display} />}
        </motion.div>
      </AnimatePresence>
      {s.phase !== "result" && <ClueBoard r={r} laps={s.laps} display={display} />}
    </div>
  );
}
