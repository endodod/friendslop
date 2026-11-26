"use client";
import { AnimatePresence, motion } from "framer-motion";
import { Check, EyeOff, Pencil, Send, ThumbsUp, Undo2 } from "lucide-react";
import { useState } from "react";
import {
  CLUECREW,
  crewClueProblem,
  type CrewPrivate,
  type CrewPublic,
  type CrewPublicClue,
} from "@party-game/shared";
import { useStore } from "@/lib/store";
import { Avatar, Icon, PlayerName, Timer, usePlayers } from "../ui";
import { Confetti } from "../fx";
import { HubSkip, hubAct, useHubPriv, useHubState } from "./common";

const BLUE = "#3d8bff";
type Card = NonNullable<CrewPublic["card"]>;

/** The secret word as a card (only clue-givers and the result ever show it). */
function WordCard({ word, display, small }: { word: string; display?: boolean; small?: boolean }) {
  return (
    <motion.div
      initial={{ rotateX: 90, opacity: 0 }}
      animate={{ rotateX: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 130, damping: 14 }}
      className={`mx-auto flex flex-col items-center rounded-3xl text-center shadow-[0_8px_0_#0005] ${small ? "px-5 py-2" : "w-full max-w-md px-6 py-5"}`}
      style={{ background: `linear-gradient(160deg, ${BLUE}, #2a5fd1)` }}
      data-testid="crew-word"
    >
      {!small && <span className="text-xs uppercase tracking-wider text-white/70">Secret word</span>}
      <span className={`font-display tracking-wide text-white ${display ? "text-6xl" : small ? "text-2xl" : "text-4xl sm:text-5xl"}`}>{word}</span>
    </motion.div>
  );
}

/** A clue as a little sticky note. */
function Note({ clue, i, display, struck, onToggle }: { clue: CrewPublicClue; i: number; display?: boolean; struck?: boolean; onToggle?: () => void }) {
  const players = usePlayers();
  const tilt = [-2.5, 1.5, -1, 2, -1.5, 1, -2, 2.5][i % 8];
  const out = struck ?? !!clue.cancelled;
  return (
    <motion.li
      initial={{ y: 20, opacity: 0, rotate: 0 }}
      animate={{ y: 0, opacity: 1, rotate: tilt }}
      transition={{ delay: i * 0.08, type: "spring", stiffness: 160, damping: 14 }}
      className={`relative flex flex-col items-center gap-1 rounded-xl px-3 pb-2 pt-3 text-center shadow-[0_5px_0_#0004] ${out ? "bg-bg-2" : "bg-[#fff3a8] text-[#14112a]"}`}
      data-testid="crew-clue"
    >
      <span className={`break-all font-display ${display ? "text-4xl" : "text-2xl"} ${out ? "text-muted line-through decoration-bad decoration-4" : ""}`}>{clue.text}</span>
      <span className={`flex items-center gap-1 text-xs ${out ? "text-muted" : "text-[#14112a]/70"}`}>
        <Avatar player={players[clue.by]} size={16} /> {players[clue.by]?.name}
      </span>
      {clue.cancelled === "dup" && <span className="absolute -right-2 -top-2 -rotate-6 rounded bg-bad px-1.5 font-display text-[10px] text-white">SAME!</span>}
      {clue.cancelled === "manual" && <span className="absolute -right-2 -top-2 -rotate-6 rounded bg-[#ff8a3d] px-1.5 font-display text-[10px] text-[#14112a]">TOO CLOSE</span>}
      {onToggle && clue.cancelled !== "dup" && (
        <button
          className={`mt-1 min-h-9 rounded-full px-3 text-xs font-semibold transition-transform active:scale-95 ${out ? "bg-panel-2 text-ink" : "bg-[#14112a]/10 text-[#14112a] hover:bg-[#14112a]/20"}`}
          onClick={onToggle}
          data-testid="crew-toggle"
        >
          {clue.cancelled ? (
            <span className="flex items-center gap-1">
              <Undo2 size={12} /> Keep it
            </span>
          ) : (
            "Too close? Strike"
          )}
        </button>
      )}
    </motion.li>
  );
}

function Notes({ clues, display, onToggle }: { clues: CrewPublicClue[]; display?: boolean; onToggle?: (id: string) => void }) {
  if (!clues.length) return <p className="py-4 text-center font-display text-xl text-bad">No clues left!</p>;
  return (
    <ul className={`grid gap-3 ${display ? "grid-cols-3 lg:grid-cols-4" : "grid-cols-2 sm:grid-cols-3"}`}>
      {clues.map((c, i) => (
        <Note key={c.id} clue={c} i={i} display={display} onToggle={onToggle ? () => onToggle(c.id) : undefined} />
      ))}
    </ul>
  );
}

function ClueForm({ word }: { word: string }) {
  const priv = useHubPriv<CrewPrivate>();
  const need = priv?.cluesNeeded ?? 1;
  const [texts, setTexts] = useState<string[]>(() => Array.from({ length: need }, () => ""));
  const [editing, setEditing] = useState(false);
  const mine = priv?.mine ?? null;
  if (mine && !editing)
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl bg-bg-2 p-4 text-center">
        <span className="flex items-center gap-2 text-sm text-muted">
          <Check size={16} className="text-good" /> Your clue{mine.length > 1 ? "s" : ""}
        </span>
        <span className="font-display text-2xl">{mine.join(" · ")}</span>
        <button
          className="btn-ghost min-h-11 text-sm"
          onClick={() => {
            setTexts(mine);
            setEditing(true);
          }}
        >
          <Pencil size={14} /> Change
        </button>
        <span className="text-sm text-muted">Waiting for the others…</span>
      </div>
    );
  const problems = texts.map((t) => (t.trim() ? crewClueProblem(t, word) : ""));
  const dupe = need > 1 && texts.every((t) => t.trim()) && new Set(texts.map((t) => t.trim().toLowerCase())).size < texts.length;
  const ready = texts.every((t) => t.trim()) && problems.every((p) => !p) && !dupe;
  return (
    <form
      className="flex flex-col gap-2 rounded-2xl p-3"
      style={{ background: `${BLUE}1a`, boxShadow: `inset 0 0 0 2px ${BLUE}` }}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!ready) return;
        const res = await hubAct({ type: "clue", texts: texts.map((t) => t.trim()) });
        if (res.ok) setEditing(false);
      }}
      data-testid="crew-clue-form"
    >
      <p className="font-display text-xl">{need > 1 ? "Write two one-word clues" : "Write a one-word clue"}</p>
      <p className="text-sm text-muted">Helpful, but not too obvious: if someone writes the same, both are cancelled.</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        {texts.map((t, i) => (
          <input
            key={i}
            className="input min-w-0 flex-1"
            value={t}
            maxLength={CLUECREW.clueMaxLength}
            placeholder={i === 0 ? "One word…" : "Another word…"}
            aria-label={`Clue ${i + 1}`}
            autoComplete="off"
            autoCapitalize="off"
            autoFocus={i === 0}
            onChange={(e) => setTexts((xs) => xs.map((x, k) => (k === i ? e.target.value.replace(/\s/g, "") : x)))}
          />
        ))}
        <button className="btn-primary shrink-0" disabled={!ready}>
          <Send size={18} /> Send
        </button>
      </div>
      {(problems.find((p) => p) || dupe) && <p className="text-sm font-semibold text-bad">{problems.find((p) => p) || "Your two clues are the same."}</p>}
    </form>
  );
}

function GuessForm() {
  const [text, setText] = useState("");
  return (
    <form
      className="flex flex-col gap-2 rounded-2xl p-3"
      style={{ background: `${BLUE}1a`, boxShadow: `inset 0 0 0 2px ${BLUE}` }}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!text.trim()) return;
        if (!confirm(`Guess "${text.trim()}"? You only get one try.`)) return;
        await hubAct({ type: "guess", text: text.trim() });
      }}
      data-testid="crew-guess-form"
    >
      <p className="font-display text-xl">Your guess (one try!)</p>
      <div className="flex gap-2">
        <input
          className="input min-w-0 flex-1"
          value={text}
          maxLength={CLUECREW.guessMaxLength}
          placeholder="The secret word is…"
          aria-label="Your guess"
          autoComplete="off"
          autoCapitalize="off"
          autoFocus
          onChange={(e) => setText(e.target.value)}
        />
        <button className="btn-primary shrink-0" disabled={!text.trim()}>
          <Send size={18} /> Guess
        </button>
      </div>
      <button
        type="button"
        className="btn-ghost min-h-11 self-center text-sm"
        onClick={() => {
          if (confirm("Pass? This card is lost, but no extra penalty.")) hubAct({ type: "pass" });
        }}
        data-testid="crew-pass"
      >
        No idea, pass (lose only this card)
      </button>
    </form>
  );
}

function LookAway({ guesserName, text }: { guesserName?: string; text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl bg-bg-2 p-6 text-center">
      <EyeOff size={40} style={{ color: BLUE }} />
      <span className="font-display text-2xl">{guesserName ? `${guesserName}, look away!` : "Look away!"}</span>
      <span className="text-sm text-muted">{text}</span>
    </div>
  );
}

function CheckPanel({ card }: { card: Card }) {
  const priv = useHubPriv<CrewPrivate>();
  const players = usePlayers();
  const s = useHubState<CrewPublic>();
  const clues = priv?.check ?? [];
  const givers = s.players.filter((p) => p !== card.guesserId);
  return (
    <div className="flex flex-col gap-3" data-testid="crew-check">
      <p className="text-center font-display text-lg">
        {clues.some((c) => c.cancelled === "dup") ? "Some of you thought alike! Those clues are out." : "No duplicates!"}{" "}
        <span className="text-muted">Strike any that are too close to each other.</span>
      </p>
      <Notes clues={clues} onToggle={(id) => hubAct({ type: "toggle", clueId: id })} />
      <button
        className={priv?.iOk ? "btn-secondary min-h-14" : "btn-primary min-h-14 text-xl"}
        disabled={priv?.iOk}
        onClick={() => hubAct({ type: "ok" })}
        data-testid="crew-ok"
      >
        {priv?.iOk ? (
          <>
            <Check /> Waiting for the others…
          </>
        ) : (
          <>
            <ThumbsUp /> Looks good
          </>
        )}
      </button>
      <div className="flex justify-center gap-1">
        {givers.map((p) => (
          <Avatar key={p} player={players[p]} size={26} dim={!card.okBy.includes(p)} />
        ))}
      </div>
    </div>
  );
}

function Result({ card, display, iAmGiver }: { card: Card; display: boolean; iAmGiver: boolean }) {
  const players = usePlayers();
  const o = card.outcome;
  const color = o === "correct" ? "var(--color-good)" : o === "wrong" ? "var(--color-bad)" : "var(--color-muted)";
  const title = o === "correct" ? (card.accepted ? "Counted!" : "Got it!") : o === "wrong" ? "Wrong!" : o === "skipped" ? "Skipped" : "Passed";
  return (
    <div className="flex flex-col gap-4" data-testid="crew-result">
      <Confetti fireKey={o === "correct" ? `crew-${card.index}-${card.accepted ? "a" : "c"}` : null} count={55} />
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 170, damping: 12 }}
        className="flex flex-col items-center gap-1 text-center"
      >
        <span className={`font-display ${display ? "text-6xl" : "text-4xl"}`} style={{ color }}>
          {title}
        </span>
        {card.guess && (
          <span className="text-muted">
            <PlayerName player={players[card.guesserId]} /> guessed “<span className="font-display text-ink">{card.guess}</span>”
          </span>
        )}
      </motion.div>
      {card.word && <WordCard word={card.word} display={display} />}
      {o === "wrong" && (
        <p className="text-center text-sm text-bad">{card.burnsNext ? "Ouch: the next card burns too." : "Last card: one solved card is lost."}</p>
      )}
      {iAmGiver && o === "wrong" && (
        <button className="btn-secondary mx-auto" onClick={() => hubAct({ type: "accept" })} data-testid="crew-accept">
          It was just a typo: count it
        </button>
      )}
      {card.clues && card.clues.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-center text-sm text-muted">All the clues</span>
          <Notes clues={card.clues} display={display} />
        </div>
      )}
      <HubSkip label="Next card" />
    </div>
  );
}

export function ClueCrewView({ display }: { display: boolean; controller?: boolean }) {
  const s = useHubState<CrewPublic>();
  const priv = useHubPriv<CrewPrivate>();
  const playerId = useStore((st) => st.playerId);
  const players = usePlayers();
  const card = s.card;
  if (!card) return <p className="py-10 text-center font-display text-3xl">Shuffling the deck…</p>;
  const guesser = players[card.guesserId];
  const iAmGuesser = !display && playerId === card.guesserId;
  const iAmGiver = !display && !!priv?.word;
  const total = s.phaseEndsAt ? s.phaseEndsAt - s.phaseStartedAt : 0;
  const givers = s.players.filter((p) => p !== card.guesserId);
  return (
    <div className="flex flex-col gap-4" data-testid="cluecrew">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-display text-xl">
          <Avatar player={guesser} size={34} ring /> {iAmGuesser ? "You're guessing" : `${guesser?.name} is guessing`}
        </span>
        <span className="flex items-center gap-1 rounded-full bg-good/15 px-3 py-0.5 font-display text-good">
          <Icon id="trophy" size={16} /> {s.score} solved
        </span>
      </div>
      {s.phase !== "result" && s.phaseEndsAt && <Timer endsAt={s.phaseEndsAt} totalMs={total} silent={display} />}
      <AnimatePresence mode="wait">
        <motion.div key={`${s.phase}-${card.index}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-col gap-4">
          {s.phase === "clue" && (
            <>
              {iAmGiver && priv?.word && (
                <>
                  <WordCard word={priv.word} />
                  <ClueForm key={card.index} word={priv.word} />
                </>
              )}
              {iAmGuesser && <LookAway text="Your crew is writing clues for you. No peeking at their phones!" />}
              {!iAmGiver && !iAmGuesser && (
                <div className="flex flex-col items-center gap-3 py-2">
                  <LookAway guesserName={guesser?.name} text="The crew is writing clues. The word only shows on their phones." />
                  <div className="flex flex-wrap justify-center gap-2">
                    {givers.map((p) => (
                      <Avatar key={p} player={players[p]} size={display ? 52 : 36} dim={!card.written.includes(p)} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
          {s.phase === "check" &&
            (iAmGiver ? (
              <>
                {priv?.word && <WordCard word={priv.word} small />}
                <CheckPanel card={card} />
              </>
            ) : (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <motion.span animate={{ rotate: [0, -8, 8, 0] }} transition={{ repeat: Infinity, duration: 1.4 }}>
                  <Icon id="magnifier" size={56} className="text-[#3d8bff]" />
                </motion.span>
                <span className={`font-display ${display ? "text-4xl" : "text-2xl"}`}>Checking for duplicates…</span>
                <span className="text-muted">
                  {card.okBy.length}/{givers.length} clue-givers are happy
                </span>
              </div>
            ))}
          {s.phase === "guess" && card.clues && (
            <>
              <p className="text-center font-display text-lg text-muted">
                {card.clues.length} clue{card.clues.length === 1 ? "" : "s"}
                {card.cancelledCount > 0 && <span className="text-bad"> · {card.cancelledCount} cancelled</span>}
              </p>
              <Notes clues={card.clues} display={display} />
              {iAmGuesser && <GuessForm />}
              {iAmGiver && (
                <div className="flex flex-col items-center gap-2">
                  {priv?.word && <WordCard word={priv.word} small />}
                  <p className="text-center text-sm text-muted">Shh! No hints, no faces.</p>
                </div>
              )}
              {!iAmGiver && !iAmGuesser && <p className="text-center font-display text-xl text-muted">{guesser?.name} is thinking…</p>}
            </>
          )}
          {s.phase === "result" && <Result card={card} display={display} iAmGiver={iAmGiver} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/** Side panel: the deck (solved, lost, to come) and who has done their part. */
export function ClueCrewSide() {
  const s = useHubState<CrewPublic>();
  const players = usePlayers();
  const card = s.card;
  const slots: ("ok" | "lost" | "burn" | "now" | "todo")[] = [];
  for (const h of s.history) if (h.outcome !== "skipped") slots.push(h.outcome === "correct" ? "ok" : "lost");
  for (let i = 0; i < s.burned; i++) slots.push("burn");
  if (card) slots.push("now");
  for (let i = 0; i < s.remaining; i++) slots.push("todo");
  const style: Record<string, string> = {
    ok: "bg-good text-[#06210f]",
    lost: "bg-bad/40 text-white",
    burn: "bg-[#ff8a3d]/50 text-white",
    now: "bg-[#3d8bff] text-white ring-2 ring-white",
    todo: "bg-bg-2 text-muted ring-1 ring-line",
  };
  const done = card ? (s.phase === "clue" ? card.written : s.phase === "check" ? card.okBy : []) : [];
  return (
    <div className="flex flex-col gap-4" data-testid="crew-side">
      <div className="flex flex-col gap-2">
        <h3 className="flex items-center justify-between font-display text-xl text-muted">
          The deck{" "}
          <span className="text-ink">
            {s.score}
            <span className="text-sm text-muted">/{s.deckSize}</span>
          </span>
        </h3>
        <ul className="flex flex-wrap gap-1.5" aria-label="Cards">
          {slots.map((k, i) => (
            <motion.li
              key={i}
              layout
              className={`flex h-9 w-7 items-center justify-center rounded-md font-display text-sm shadow-[0_3px_0_#0004] ${style[k]}`}
              title={{ ok: "Solved", lost: "Lost", burn: "Burned by a wrong guess", now: "This card", todo: "To come" }[k]}
            >
              {k === "ok" ? "✓" : k === "lost" ? "✗" : k === "burn" ? "🔥" : k === "now" ? "?" : ""}
            </motion.li>
          ))}
        </ul>
        <p className="text-xs text-muted">✓ solved · ✗ lost · 🔥 burned by a wrong guess</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <h3 className="font-display text-xl text-muted">The crew</h3>
        {s.players.map((p) => {
          const isGuesser = card?.guesserId === p;
          return (
            <div key={p} className="flex items-center gap-2 rounded-2xl bg-bg-2 px-2 py-1.5">
              <span className="relative">
                <Avatar player={players[p]} size={30} dim={!players[p]?.connected} />
                {done.includes(p) && (
                  <span className="absolute -bottom-1 -right-1 rounded-full bg-good p-0.5 text-[#06210f]">
                    <Check size={10} strokeWidth={4} />
                  </span>
                )}
              </span>
              <PlayerName player={players[p]} className="min-w-0 flex-1 truncate" />
              {isGuesser && <span className="rounded-full bg-[#3d8bff] px-2 text-xs font-display text-white">guessing</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
