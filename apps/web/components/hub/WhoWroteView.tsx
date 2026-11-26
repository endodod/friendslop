"use client";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Pencil, Send, X } from "lucide-react";
import { useState } from "react";
import { WHOWROTE, type WhoPrivate, type WhoPublic } from "@party-game/shared";
import { useStore } from "@/lib/store";
import { Avatar, Icon, PlayerName, Timer, usePlayers } from "../ui";
import { Confetti } from "../fx";
import { HubSkip, hubAct, useHubPriv, useHubState } from "./common";

const PURPLE = "#b26bff";
type Round = NonNullable<WhoPublic["round"]>;

function Prompt({ r, display, small }: { r: Round; display: boolean; small?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2 text-center" data-testid="whowrote-prompt">
      <span className="rounded-full px-3 py-0.5 font-display text-sm" style={{ background: `${PURPLE}33`, color: PURPLE }}>
        Everyone answers
      </span>
      <h2 className={`font-display leading-tight ${small ? (display ? "text-3xl" : "text-xl") : display ? "text-5xl" : "text-3xl sm:text-4xl"}`}>{r.prompt}</h2>
    </div>
  );
}

function WriteForm() {
  const priv = useHubPriv<WhoPrivate>();
  const [text, setText] = useState("");
  const [editing, setEditing] = useState(false);
  const mine = priv?.myAnswer ?? null;
  if (mine && !editing)
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl bg-bg-2 p-4 text-center">
        <span className="flex items-center gap-2 text-sm text-muted">
          <Check size={16} className="text-good" /> Your answer (secret until someone guesses it)
        </span>
        <span className="font-display text-2xl">“{mine}”</span>
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
      className="flex flex-col gap-2 rounded-2xl p-3 ring-2"
      style={{ background: `${PURPLE}1a`, boxShadow: `inset 0 0 0 2px ${PURPLE}` }}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!text.trim()) return;
        const res = await hubAct({ type: "write", text: text.trim() });
        if (res.ok) setEditing(false);
      }}
      data-testid="whowrote-write"
    >
      <p className="font-display text-xl">Answer about yourself, honestly.</p>
      <p className="text-sm text-muted">Nobody sees who wrote what. Every friend who guesses wrong on yours gives you +1.</p>
      <div className="flex gap-2">
        <input
          className="input min-w-0 flex-1"
          value={text}
          maxLength={WHOWROTE.answerMaxLength}
          placeholder="Your answer…"
          aria-label="Your answer"
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

/** The anonymous answer, as a note card. */
function AnswerCard({ text, display, number, count }: { text: string; display: boolean; number: number; count: number }) {
  return (
    <motion.div
      key={text}
      initial={{ rotate: -6, y: 30, opacity: 0 }}
      animate={{ rotate: -1.5, y: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 140, damping: 13 }}
      className="relative mx-auto w-full max-w-xl rounded-3xl p-5 text-center shadow-[0_10px_0_#0005] sm:p-7"
      style={{ background: `linear-gradient(160deg, ${PURPLE}, #7a3fd1)` }}
      data-testid="whowrote-answer"
    >
      <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-panel px-3 py-0.5 text-xs text-muted">
        Answer {number} of {count}
      </span>
      <span className={`block break-words font-display text-white ${display ? "text-5xl" : "text-3xl"}`}>“{text}”</span>
      <span className="mt-2 block text-sm text-white/70">Who wrote that?</span>
    </motion.div>
  );
}

function GuessPicker({ r }: { r: Round }) {
  const priv = useHubPriv<WhoPrivate>();
  const s = useHubState<WhoPublic>();
  const playerId = useStore((st) => st.playerId);
  const players = usePlayers();
  const [pending, setPending] = useState<string | null>(null);
  if (priv?.isMine)
    return (
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="flex flex-col items-center gap-1 rounded-2xl p-4 text-center"
        style={{ background: `${PURPLE}22` }}
      >
        <span className="text-4xl">🤫</span>
        <span className="font-display text-2xl">That one&apos;s yours!</span>
        <span className="text-sm text-muted">Keep a straight face. Every wrong guess is +1 for you.</span>
      </motion.div>
    );
  const guess = priv?.myGuess ?? pending;
  const candidates = s.players.filter((p) => p !== playerId && r.written.includes(p));
  return (
    <div className="flex flex-col gap-3" data-testid="whowrote-guess">
      <p className="text-center font-display text-lg text-muted">{priv?.myGuess ? "Locked in! Waiting for the others…" : "Tap who you think wrote it"}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {candidates.map((p) => {
          const chosen = guess === p;
          return (
            <motion.button
              key={p}
              whileTap={!priv?.myGuess ? { scale: 0.94 } : undefined}
              disabled={!!priv?.myGuess}
              onClick={async () => {
                setPending(p);
                const res = await hubAct({ type: "guess", playerId: p });
                if (!res.ok) setPending(null);
              }}
              className={`flex min-h-14 items-center gap-2 rounded-2xl border-2 px-3 py-2 text-left transition-transform ${
                chosen ? "bg-accent/20" : "border-line bg-panel-2"
              } ${!priv?.myGuess ? "hover:-translate-y-0.5" : "opacity-90"}`}
              style={{ borderColor: chosen ? PURPLE : "var(--color-line)" }}
              data-testid="whowrote-candidate"
            >
              <Avatar player={players[p]} size={34} />
              <PlayerName player={players[p]} className="min-w-0 flex-1 truncate font-display" />
              {chosen && <Check className="shrink-0" style={{ color: PURPLE }} />}
            </motion.button>
          );
        })}
      </div>
      <button
        className={`mx-auto flex min-h-11 items-center gap-2 rounded-full px-4 transition-transform active:scale-90 ${priv?.myLaugh ? "bg-accent/30 ring-2 ring-accent" : "bg-bg-2"}`}
        aria-pressed={!!priv?.myLaugh}
        onClick={() => hubAct({ type: "laugh", on: !priv?.myLaugh })}
      >
        <span className={`text-2xl ${priv?.myLaugh ? "" : "grayscale"}`}>😂</span>
        <span className="text-sm">{priv?.myLaugh ? "You loved this one" : "Great answer (+1 to its author)"}</span>
      </button>
    </div>
  );
}

function Result({ r, display }: { r: Round; display: boolean }) {
  const players = usePlayers();
  const last = r.revealed[r.revealed.length - 1];
  if (!last) return null;
  const guessers = Object.keys(last.guesses);
  const right = guessers.filter((g) => last.guesses[g] === last.authorId);
  const wrong = guessers.filter((g) => last.guesses[g] !== last.authorId);
  return (
    <div className="flex flex-col gap-4" data-testid="whowrote-result">
      <Confetti fireKey={right.length === 0 && guessers.length > 1 ? `fool-${r.index}-${r.answerNumber}` : null} count={40} />
      <motion.div
        initial={{ scale: 0.4, opacity: 0, rotate: -10 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 150, damping: 12, delay: 0.2 }}
        className="flex flex-col items-center gap-2"
      >
        <span className="text-sm uppercase tracking-wider text-muted">Written by</span>
        <Avatar player={players[last.authorId]} size={display ? 96 : 72} ring />
        <PlayerName player={players[last.authorId]} className={`font-display ${display ? "text-5xl" : "text-3xl"}`} />
        <span className="text-sm text-muted">
          {right.length === 0 ? "Nobody saw it coming!" : wrong.length === 0 ? "Everyone knew!" : `${right.length} of ${guessers.length} got it`}
          {last.laughs.length > 0 && ` · 😂 ×${last.laughs.length}`}
        </span>
      </motion.div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {guessers.map((g, i) => {
          const ok = last.guesses[g] === last.authorId;
          return (
            <motion.li
              key={g}
              initial={{ x: -16, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.6 + i * 0.08 }}
              className={`flex items-center gap-2 rounded-2xl px-3 py-2 ${ok ? "bg-good/15" : "bg-bg-2"}`}
            >
              <Avatar player={players[g]} size={26} />
              <PlayerName player={players[g]} className="min-w-0 flex-1 truncate" />
              <span className="flex items-center gap-1 text-sm text-muted">
                said <Avatar player={players[last.guesses[g]]} size={20} />
              </span>
              {ok ? <Check size={18} className="text-good" /> : <X size={18} className="text-bad" />}
              <span className={`w-8 text-right font-display ${ok ? "text-good" : "text-muted"}`}>{ok ? `+${WHOWROTE.points.correct}` : ""}</span>
            </motion.li>
          );
        })}
      </ul>
      {(last.points[last.authorId] ?? 0) > 0 && (
        <p className="text-center text-sm">
          <PlayerName player={players[last.authorId]} /> gets <span className="font-display text-good">+{last.points[last.authorId]}</span> for fooling friends
          {last.laughs.length ? " and the laughs" : ""}.
        </p>
      )}
      <HubSkip label="Next answer" />
    </div>
  );
}

/** Answers already revealed this round (on wide screens next to the current one). */
function Revealed({ r, phase }: { r: Round; phase: WhoPublic["phase"] }) {
  const players = usePlayers();
  // The newest one is on screen during its result.
  const done = phase === "result" ? r.revealed.slice(0, -1) : r.revealed;
  if (!done.length) return null;
  return (
    <details className="rounded-2xl bg-bg-2 p-3 text-sm">
      <summary className="cursor-pointer text-muted">Revealed so far ({done.length})</summary>
      <ul className="mt-2 flex flex-col gap-1.5">
        {done.map((a) => (
          <li key={a.authorId} className="flex items-center gap-2">
            <Avatar player={players[a.authorId]} size={22} />
            <span className="min-w-0 flex-1 truncate">“{a.text}”</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

export function WhoWroteView({ display }: { display: boolean; controller?: boolean }) {
  const s = useHubState<WhoPublic>();
  const playerId = useStore((st) => st.playerId);
  const players = usePlayers();
  const r = s.round;
  if (!r) return <p className="py-10 text-center font-display text-3xl">Get ready…</p>;
  const total = s.phaseEndsAt ? s.phaseEndsAt - s.phaseStartedAt : 0;
  const inGame = !!playerId && s.players.includes(playerId);
  const cur = r.current;
  return (
    <div className="flex flex-col gap-4" data-testid="whowrote">
      <div className="flex items-center justify-between text-sm text-muted">
        <span>
          Question {r.index + 1}/{s.totalRounds}
        </span>
        <span className="flex items-center gap-1">
          <Icon id="open-book" size={14} /> {s.phase === "write" ? "Write" : `Answer ${r.answerNumber}/${r.answerCount}`}
        </span>
      </div>
      {s.phase !== "result" && s.phaseEndsAt && <Timer endsAt={s.phaseEndsAt} totalMs={total} silent={display} />}
      <Prompt r={r} display={display} small={s.phase !== "write"} />
      <AnimatePresence mode="wait">
        <motion.div
          key={`${s.phase}-${r.index}-${r.answerNumber}`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="flex flex-col gap-4"
        >
          {s.phase === "write" &&
            (display || !inGame ? (
              <div className="flex flex-col items-center gap-3">
                <p className="text-center font-display text-xl text-muted">
                  Everyone is writing… {r.written.length}/{s.players.length}
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  {s.players.map((p) => (
                    <Avatar key={p} player={players[p]} size={display ? 52 : 36} dim={!r.written.includes(p)} />
                  ))}
                </div>
              </div>
            ) : (
              <WriteForm />
            ))}
          {(s.phase === "guess" || s.phase === "result") && cur && (
            <>
              <AnswerCard text={cur.text} display={display} number={r.answerNumber} count={r.answerCount} />
              {s.phase === "guess" &&
                (display || !inGame ? (
                  <p className="text-center font-display text-xl text-muted">
                    Guessing… {cur.guessed.length}/{s.players.length - 1}
                    {cur.laughs > 0 && <span className="ml-2">😂 ×{cur.laughs}</span>}
                  </p>
                ) : (
                  <GuessPicker r={r} />
                ))}
              {s.phase === "result" && <Result r={r} display={display} />}
            </>
          )}
        </motion.div>
      </AnimatePresence>
      {s.phase !== "write" && <Revealed r={r} phase={s.phase} />}
    </div>
  );
}
