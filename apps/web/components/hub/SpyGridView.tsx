"use client";
import { AnimatePresence, motion } from "framer-motion";
import { Eye, Flag, Send } from "lucide-react";
import { useEffect, useState } from "react";
import {
  SPYGRID,
  TEAM_INFO,
  UNLIMITED,
  clueProblem,
  type CardKind,
  type SpyPrivate,
  type SpyPublic,
  type TeamId,
} from "@party-game/shared";
import { useStore } from "@/lib/store";
import { play } from "@/lib/sfx";
import { Avatar, Icon, PlayerName, Timer, usePlayers } from "../ui";
import { Banner, HubSkip, TeamChip, hubAct, useHubPriv, useHubState } from "./common";

const KIND_STYLE: Record<CardKind, { bg: string; fg: string; label: string }> = {
  a: { bg: TEAM_INFO.a.color, fg: "#241000", label: `${TEAM_INFO.a.name} agent` },
  b: { bg: TEAM_INFO.b.color, fg: "#0e0a2a", label: `${TEAM_INFO.b.name} agent` },
  neutral: { bg: "#d9cfb0", fg: "#2a2415", label: "Bystander" },
  trap: { bg: "#0b0b10", fg: "#ff4d5e", label: "Trap" },
};

const other = (t: TeamId): TeamId => (t === "a" ? "b" : "a");

function useSpy() {
  const s = useHubState<SpyPublic>();
  const priv = useHubPriv<SpyPrivate>();
  const playerId = useStore((st) => st.playerId);
  const myTeam = playerId ? s.teams[playerId] : undefined;
  const iAmGiver = !!playerId && (s.clueGivers.a === playerId || s.clueGivers.b === playerId);
  const guessers = (t: TeamId) => {
    const members = Object.keys(s.teams).filter((p) => s.teams[p] === t);
    const g = members.filter((p) => p !== s.clueGivers[t]);
    return g.length ? g : members;
  };
  const canVote = s.phase === "guess" && !!playerId && myTeam === s.turn && guessers(s.turn).includes(playerId);
  return { s, key: priv?.key ?? null, playerId, myTeam, iAmGiver, canVote, guessers };
}

/** Intro: who is on which team and who gives the clues. */
export function SpyGridIntroTeams() {
  const { s, myTeam, iAmGiver } = useSpy();
  const players = usePlayers();
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {(["a", "b"] as const).map((t) => (
        <div key={t} className="flex flex-col gap-2 rounded-2xl p-3" style={{ background: `${TEAM_INFO[t].color}22`, boxShadow: `inset 0 0 0 2px ${TEAM_INFO[t].color}88` }}>
          <div className="flex items-center justify-between">
            <TeamChip team={t} />
            {t === s.startTeam && <span className="text-xs text-muted">starts · 9 agents</span>}
            {t !== s.startTeam && <span className="text-xs text-muted">8 agents</span>}
          </div>
          <ul className="flex flex-wrap gap-2">
            {Object.keys(s.teams)
              .filter((p) => s.teams[p] === t)
              .map((p) => (
                <li key={p} className="flex items-center gap-1.5 rounded-full bg-bg-2 py-0.5 pl-0.5 pr-2.5">
                  <Avatar player={players[p]} size={26} />
                  <span className="font-display text-sm">{players[p]?.name}</span>
                  {s.clueGivers[t] === p && <Eye size={14} className="text-accent" aria-label="clue-giver" />}
                </li>
              ))}
          </ul>
        </div>
      ))}
      {myTeam && (
        <p className="rounded-2xl bg-accent/15 p-3 text-center font-display text-lg sm:col-span-2">
          You&apos;re on the {TEAM_INFO[myTeam].emoji} {TEAM_INFO[myTeam].name}.{" "}
          {iAmGiver ? "You give the clues: only you see the key!" : "You guess with your team."}
        </p>
      )}
    </div>
  );
}

/** Sidebar: both teams, agents left, who's who. */
export function SpyGridSide() {
  const { s } = useSpy();
  const players = usePlayers();
  return (
    <div className="flex flex-col gap-3" data-testid="spygrid-side">
      {(["a", "b"] as const).map((t) => (
        <div
          key={t}
          className={`flex flex-col gap-2 rounded-2xl p-3 transition-shadow ${s.turn === t && s.phase !== "over" ? "ring-2" : ""}`}
          style={{ background: `${TEAM_INFO[t].color}1f`, ["--tw-ring-color" as string]: TEAM_INFO[t].color }}
        >
          <div className="flex items-center justify-between gap-2">
            <TeamChip team={t} />
            <span className="font-display text-2xl tabular-nums" aria-label={`${s.left[t]} agents left`}>
              {s.left[t]} <span className="text-sm text-muted">left</span>
            </span>
          </div>
          <ul className="flex flex-col gap-1">
            {Object.keys(s.teams)
              .filter((p) => s.teams[p] === t)
              .map((p) => (
                <li key={p} className="flex items-center gap-2">
                  <Avatar player={players[p]} size={26} dim={!players[p]?.connected} />
                  <PlayerName player={players[p]} className="min-w-0 flex-1 truncate text-sm" />
                  {s.clueGivers[t] === p && (
                    <span className="flex items-center gap-1 rounded-full bg-accent/20 px-2 text-xs text-accent">
                      <Eye size={12} /> clues
                    </span>
                  )}
                </li>
              ))}
          </ul>
        </div>
      ))}
      <TurnLog />
    </div>
  );
}

function TurnLog() {
  const { s } = useSpy();
  const done = s.log.filter((l) => l.clue).slice(-6).reverse();
  if (!done.length) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <h4 className="font-display text-muted">Clues so far</h4>
      {done.map((l, i) => (
        <div key={i} className="flex flex-wrap items-center gap-1.5 rounded-xl bg-bg-2 px-2 py-1.5 text-sm">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: TEAM_INFO[l.team].color }} aria-label={TEAM_INFO[l.team].name} />
          <span className="font-display">
            {l.clue!.word} {l.clue!.count === UNLIMITED ? "∞" : l.clue!.count}
          </span>
          {l.reveals.map((idx) => {
            const c = s.cards[idx];
            const st = c.kind ? KIND_STYLE[c.kind] : null;
            return (
              <span key={idx} className="rounded-md px-1.5 text-xs font-semibold" style={{ background: st?.bg, color: st?.fg }}>
                {c.word}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function Grid({ display }: { display: boolean }) {
  const { s, key, playerId, canVote } = useSpy();
  const players = usePlayers();
  const votersOf = (i: number) => Object.entries(s.votes).filter(([, v]) => v === i).map(([p]) => p);
  return (
    <div className={`grid grid-cols-5 ${display ? "gap-3" : "gap-1.5 sm:gap-2"}`} data-testid="spy-grid" role="grid" aria-label="Word grid">
      {s.cards.map((c, i) => {
        const revealedKind = c.kind;
        const keyKind = key?.[i] ?? null;
        const st = revealedKind ? KIND_STYLE[revealedKind] : null;
        const hint = !c.revealed && keyKind ? KIND_STYLE[keyKind] : null;
        const voters = votersOf(i);
        const mine = playerId ? s.votes[playerId] === i : false;
        const clickable = canVote && !c.revealed;
        const fresh = s.lastReveal?.index === i;
        return (
          <motion.button
            key={`${i}-${c.revealed}`}
            role="gridcell"
            initial={c.revealed && fresh ? { rotateY: 90, scale: 0.9 } : false}
            animate={{ rotateY: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 180, damping: 16 }}
            disabled={!clickable}
            onClick={() => hubAct({ type: "vote", index: mine ? null : i })}
            aria-label={`${c.word}${c.revealed && st ? `, ${st.label}` : ""}${hint ? `, key: ${hint.label}` : ""}${voters.length ? `, ${voters.length} votes` : ""}`}
            aria-pressed={mine}
            data-word={c.word}
            className={`relative flex ${display ? "aspect-[2/1]" : "aspect-[4/3]"} min-w-0 flex-col items-center justify-center rounded-xl border-2 px-0.5 text-center font-display leading-none transition-[transform,box-shadow] sm:rounded-2xl ${
              display ? "text-[clamp(12px,1.5vw,26px)]" : "text-[clamp(8.5px,2.7vw,17px)]"
            } ${clickable ? "cursor-pointer hover:-translate-y-0.5 active:scale-95" : "cursor-default"} ${mine ? "ring-4 ring-accent" : ""}`}
            style={{
              background: st ? st.bg : hint ? `${hint.bg}40` : "var(--color-panel-2)",
              color: st ? st.fg : "var(--color-ink)",
              borderColor: st ? st.bg : hint ? hint.bg : "var(--color-line)",
              opacity: c.revealed ? 0.92 : 1,
            }}
          >
            {(revealedKind === "trap" || (!c.revealed && keyKind === "trap")) && (
              <Icon id="skull" size={display ? 22 : 14} className={c.revealed ? "mb-0.5 text-bad" : "absolute right-1 top-1 text-bad"} />
            )}
            {/* Long words shrink instead of breaking in the middle. */}
            <span
              className={`w-full whitespace-nowrap uppercase ${c.revealed ? "line-through decoration-2 opacity-80" : ""}`}
              style={{ fontSize: c.word.length > 7 ? `${Math.max(0.62, 7 / c.word.length)}em` : undefined }}
            >
              {c.word}
            </span>
            {voters.length > 0 && !c.revealed && (
              <span className="absolute -bottom-2 left-1/2 flex -translate-x-1/2 -space-x-1.5">
                {voters.slice(0, 4).map((p) => (
                  <Avatar key={p} player={players[p]} size={display ? 26 : 18} />
                ))}
              </span>
            )}
          </motion.button>
        );
      })}
    </div>
  );
}

function ClueForm() {
  const { s } = useSpy();
  const [word, setWord] = useState("");
  const [count, setCount] = useState(1);
  const problem = word.trim() ? clueProblem({ cards: s.cards.map((c) => ({ ...c, kind: "neutral" as CardKind, revealedBy: null })) }, word) : null;
  const myLeft = s.left[s.turn];
  return (
    <form
      className="flex flex-col gap-3 rounded-2xl bg-accent/10 p-3 ring-2 ring-accent"
      onSubmit={async (e) => {
        e.preventDefault();
        if (problem || !word.trim()) return;
        const res = await hubAct({ type: "clue", word: word.trim(), count });
        if (res.ok) setWord("");
      }}
      data-testid="clue-form"
    >
      <p className="font-display text-xl">Your clue! The tinted words are your key.</p>
      <div className="flex gap-2">
        <input
          className="input min-w-0 flex-1 uppercase"
          value={word}
          maxLength={SPYGRID.clueMaxLength}
          placeholder="One word"
          aria-label="Clue word"
          autoComplete="off"
          autoCapitalize="characters"
          onChange={(e) => setWord(e.target.value.replace(/\s/g, ""))}
        />
        <button className="btn-primary shrink-0" disabled={!word.trim() || !!problem}>
          <Send size={18} /> Give
        </button>
      </div>
      {problem && <p className="text-sm font-semibold text-bad">{problem}</p>}
      <div className="flex flex-col gap-1">
        <span className="text-sm text-muted">How many words does it point to?</span>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Number">
          {[...Array.from({ length: Math.min(SPYGRID.maxCount, Math.max(1, myLeft)) }, (_, i) => i + 1), 0, UNLIMITED].map((n) => (
            <button
              type="button"
              key={n}
              role="radio"
              aria-checked={count === n}
              onClick={() => setCount(n)}
              className={`min-h-11 min-w-11 rounded-xl font-display text-lg ${count === n ? "bg-accent text-[#241a00]" : "bg-bg-2 text-muted"}`}
              title={n === 0 ? "Zero: none of yours (unlimited guesses)" : n === UNLIMITED ? "Unlimited" : undefined}
            >
              {n === UNLIMITED ? "∞" : n}
            </button>
          ))}
        </div>
      </div>
    </form>
  );
}

function TurnEndBanner() {
  const { s } = useSpy();
  const last = s.log[s.log.length - 1];
  const next = other(s.turn);
  const text: Record<string, string> = {
    neutral: "A bystander! Turn over.",
    enemy: `Oops, a ${TEAM_INFO[next].name} agent!`,
    pass: "The team ended its turn.",
    out: "Out of guesses!",
    timeout: "Time's up!",
    noClue: "No clue this turn.",
  };
  useEffect(() => {
    if (last?.ended === "neutral" || last?.ended === "enemy") play("miss");
  }, [last?.ended]);
  return (
    <div className="flex flex-col items-center gap-3 py-4" data-testid="turn-end">
      <Banner color={TEAM_INFO[s.turn].color}>{text[last?.ended ?? ""] ?? "Turn over"}</Banner>
      <p className="font-display text-2xl">
        Next: <TeamChip team={next} className="text-xl" />
      </p>
    </div>
  );
}

/** Phones next to a TV still show the grid: guessers vote on it. */
export function SpyGridView({ display }: { display: boolean; controller?: boolean }) {
  const { s, myTeam, iAmGiver, canVote, playerId, guessers } = useSpy();
  const players = usePlayers();
  const giver = s.clueGivers[s.turn];
  const myTurn = myTeam === s.turn;
  const timerTotal = s.phaseEndsAt ? s.phaseEndsAt - s.phaseStartedAt : 0;
  const passVotes = Object.values(s.votes).filter((v) => v === "pass").length;
  const nGuessers = guessers(s.turn).filter((p) => players[p]?.connected).length || 1;
  const need = Math.floor(nGuessers / 2) + 1;
  const iPassed = !!playerId && s.votes[playerId] === "pass";
  const reveals = s.log[s.log.length - 1]?.reveals.length ?? 0;

  return (
    <div className="flex flex-col gap-4" data-testid="spygrid">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-display text-2xl">
          <TeamChip team={s.turn} className="text-xl">
            {TEAM_INFO[s.turn].name}&apos; turn
          </TeamChip>
        </span>
        {!display && myTeam && (
          <span className="text-sm text-muted">
            You: {TEAM_INFO[myTeam].emoji} {iAmGiver ? "clue-giver" : "guesser"}
          </span>
        )}
      </div>
      {s.phaseEndsAt && <Timer endsAt={s.phaseEndsAt} totalMs={timerTotal} silent={!myTurn} />}

      <AnimatePresence mode="wait">
        {s.phase === "clue" && (
          <motion.div key="clue" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {!display && iAmGiver && myTurn ? (
              <ClueForm />
            ) : (
              <p className="flex items-center justify-center gap-2 rounded-2xl bg-bg-2 p-3 text-center font-display text-xl">
                <Avatar player={giver ? players[giver] : undefined} size={32} /> {giver ? players[giver]?.name : "?"} is thinking of a clue…
              </p>
            )}
          </motion.div>
        )}
        {s.phase === "guess" && s.clue && (
          <motion.div key="guess" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex flex-col items-center gap-1" data-testid="clue">
            <span className="text-sm text-muted">Clue from {players[s.clue.givenBy]?.name}</span>
            <span className="rounded-2xl px-5 py-2 font-display text-4xl text-[#14112a] sm:text-5xl" style={{ background: TEAM_INFO[s.turn].color }}>
              {s.clue.word} · {s.clue.count === UNLIMITED ? "∞" : s.clue.count}
            </span>
            <span className="text-sm text-muted">
              {s.guessesLeft >= 99 ? "Unlimited guesses" : `${s.guessesLeft} guess${s.guessesLeft === 1 ? "" : "es"} left`}
              {canVote ? ` · tap a word to vote, ${need > 1 ? `${need} votes reveal it` : "1 vote reveals it"}` : myTurn && iAmGiver ? " · no hints now, just watch!" : ""}
            </span>
          </motion.div>
        )}
        {s.phase === "turnEnd" && (
          <motion.div key="end" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <TurnEndBanner />
          </motion.div>
        )}
      </AnimatePresence>

      <Grid display={display} />

      {!display && canVote && (
        <button
          className={iPassed ? "btn-secondary" : "btn-ghost border-2 border-line"}
          disabled={reveals === 0}
          onClick={() => (iPassed ? hubAct({ type: "vote", index: null }) : hubAct({ type: "pass" }))}
          data-testid="end-turn"
          title={reveals === 0 ? "Guess at least one word first" : undefined}
        >
          <Flag size={18} /> {iPassed ? "Take back" : "End our turn"} {passVotes > 0 && `(${passVotes}/${need})`}
        </button>
      )}
      {!display && !myTurn && myTeam && s.phase !== "turnEnd" && (
        <p className="text-center text-sm text-muted">The {TEAM_INFO[s.turn].name} are playing. Watch their picks!</p>
      )}
      {s.phase === "turnEnd" && <HubSkip />}
    </div>
  );
}
