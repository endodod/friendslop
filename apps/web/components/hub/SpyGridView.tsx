"use client";
import { AnimatePresence, motion } from "framer-motion";
import { Eye, Flag, Send, SkipForward } from "lucide-react";
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
import { Banner, HubSkip, Splash, TeamChip, chunky, hubAct, shade, useHub, useHubPriv, useHubState } from "./common";

const KIND_STYLE: Record<CardKind, { bg: string; fg: string; label: string; stamp: string }> = {
  a: { bg: TEAM_INFO.a.color, fg: "#241000", label: `${TEAM_INFO.a.name} agent`, stamp: TEAM_INFO.a.emoji },
  b: { bg: TEAM_INFO.b.color, fg: "#0e0a2a", label: `${TEAM_INFO.b.name} agent`, stamp: TEAM_INFO.b.emoji },
  neutral: { bg: "#d9cfb0", fg: "#2a2415", label: "Bystander", stamp: "🚶" },
  trap: { bg: "#2a1420", fg: "#ff4d5e", label: "Trap", stamp: "💀" },
};

const CARD_BG = "#3a3462";

/** Card surfaces: unrevealed (plain or tinted with the key), revealed (sunk in its color), my vote (white ring). */
function cardStyle(revealed: CardKind | null, hint: CardKind | null, mine: boolean, flagged: boolean): React.CSSProperties {
  const ring = mine ? "0 0 0 3px #0d0b1a, 0 0 0 6px #fff, " : flagged ? "0 0 0 2px #ffc933, " : "";
  if (revealed) {
    const c = KIND_STYLE[revealed].bg;
    return { background: `linear-gradient(180deg, #ffffff30 0%, #ffffff00 50%), ${c}`, boxShadow: `inset 0 3px 0 ${shade(c, 0.7)}`, color: KIND_STYLE[revealed].fg, transform: "translateY(3px)" };
  }
  if (hint) {
    const c = KIND_STYLE[hint].bg;
    return {
      background: `linear-gradient(180deg, #ffffff2a 0%, #ffffff00 45%), linear-gradient(${c}5c, ${c}5c), ${CARD_BG}`,
      boxShadow: `${ring}0 4px 0 ${shade(c, 0.45)}, 0 7px 12px #0005`,
      color: "var(--color-ink)",
    };
  }
  const base = chunky(CARD_BG, { depth: 4 });
  return { ...base, boxShadow: `${ring}${base.boxShadow}`, color: "var(--color-ink)" };
}

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

/** Each player's own flags on cards ("maybe this one"), kept per game across refreshes. Never sent to the server. */
function useFlags(matchId: string) {
  const storageKey = `party-game:spyflags:${matchId}`;
  const [flags, setFlags] = useState<number[]>([]);
  useEffect(() => {
    try {
      const v = JSON.parse(sessionStorage.getItem(storageKey) ?? "[]");
      setFlags(Array.isArray(v) ? v.filter((x) => Number.isInteger(x)) : []);
    } catch {
      setFlags([]);
    }
  }, [storageKey]);
  const toggle = (i: number) =>
    setFlags((f) => {
      const next = f.includes(i) ? f.filter((x) => x !== i) : [...f, i];
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* storage blocked: flags just don't survive a refresh */
      }
      return next;
    });
  return { flags, toggle };
}

function Grid({ display }: { display: boolean }) {
  const { s, key, playerId, canVote } = useSpy();
  const hub = useHub();
  const players = usePlayers();
  const { flags, toggle } = useFlags(hub.matchId);
  const votersOf = (i: number) => Object.entries(s.votes).filter(([, v]) => v === i).map(([p]) => p);
  return (
    <div
      className={`mx-auto grid w-full grid-cols-5 ${
        display ? "max-w-[calc((100dvh-250px)*2)] gap-2.5" : "gap-1 sm:max-w-[calc((100dvh-330px)*2.2)] sm:gap-1.5"
      }`}
      data-testid="spy-grid"
      role="grid"
      aria-label="Word grid"
    >
      {s.cards.map((c, i) => {
        const revealedKind = c.kind;
        const keyKind = key?.[i] ?? null;
        const st = revealedKind ? KIND_STYLE[revealedKind] : null;
        const hint = !c.revealed && keyKind ? KIND_STYLE[keyKind] : null;
        const voters = votersOf(i);
        const mine = playerId ? s.votes[playerId] === i : false;
        const clickable = canVote && !c.revealed;
        const fresh = s.lastReveal?.index === i;
        const flagged = !c.revealed && flags.includes(i);
        return (
          <div key={i} className="relative min-w-0" role="gridcell">
            <motion.button
              key={`${i}-${c.revealed}`}
              initial={c.revealed && fresh ? { rotateY: 90, scale: 0.9 } : false}
              animate={{ rotateY: 0, scale: 1 }}
              transition={{ type: "spring", stiffness: 180, damping: 16 }}
              disabled={!clickable}
              onClick={() => hubAct({ type: "vote", index: mine ? null : i })}
              aria-label={`${c.word}${c.revealed && st ? `, ${st.label}` : ""}${hint ? `, key: ${hint.label}` : ""}${flagged ? ", flagged" : ""}${voters.length ? `, ${voters.length} votes` : ""}`}
              aria-pressed={mine}
              data-word={c.word}
              data-testid="spy-card"
              className={`relative flex w-full ${display ? "aspect-[2/1]" : "aspect-[3/2] sm:aspect-[2/1]"} min-w-0 flex-col items-center justify-center overflow-hidden rounded-lg px-0.5 text-center font-display leading-none transition-[transform,box-shadow,filter] sm:rounded-xl ${
                display ? "text-[clamp(12px,1.4vw,24px)]" : "text-[clamp(8.5px,2.6vw,15px)]"
              } ${clickable ? "cursor-pointer hover:-translate-y-0.5 hover:brightness-110 active:translate-y-0.5" : "cursor-default"}`}
              style={cardStyle(c.revealed ? revealedKind : null, c.revealed ? null : keyKind, mine, flagged)}
            >
              {c.revealed && st && (
                <span aria-hidden className={`pointer-events-none absolute -right-1 -top-1 rotate-12 opacity-35 ${display ? "text-5xl" : "text-2xl sm:text-3xl"}`}>
                  {st.stamp}
                </span>
              )}
              {(revealedKind === "trap" || (!c.revealed && keyKind === "trap")) && (
                <Icon id="skull" size={display ? 22 : 12} className={c.revealed ? "mb-0.5 text-bad" : "absolute left-1 top-1 text-bad"} />
              )}
              {/* Long words shrink instead of breaking in the middle. */}
              <span
                className={`relative w-full whitespace-nowrap uppercase drop-shadow-[0_2px_0_#0004] ${c.revealed ? "opacity-85" : ""}`}
                style={{ fontSize: c.word.length > 7 ? `${Math.max(0.62, 7 / c.word.length)}em` : undefined }}
              >
                {c.word}
              </span>
              {voters.length > 0 && !c.revealed && (
                <span className="absolute -bottom-1.5 left-1/2 flex -translate-x-1/2 -space-x-1.5">
                  {voters.slice(0, 4).map((p) => (
                    <Avatar key={p} player={players[p]} size={display ? 24 : 16} />
                  ))}
                </span>
              )}
            </motion.button>
            {!display && !c.revealed && (
              <button
                type="button"
                className={`absolute right-0 top-0 flex h-6 w-6 items-center justify-center rounded-bl-lg rounded-tr-lg transition-colors sm:h-7 sm:w-7 sm:rounded-tr-xl ${
                  flagged ? "text-accent" : "text-muted/50 hover:text-muted"
                }`}
                aria-label={flagged ? `Unflag ${c.word}` : `Flag ${c.word}`}
                aria-pressed={flagged}
                title={flagged ? "Remove your flag" : "Flag it (only you see this)"}
                onClick={() => toggle(i)}
                data-testid="spy-flag"
              >
                <Flag size={13} fill={flagged ? "currentColor" : "none"} strokeWidth={2.5} />
              </button>
            )}
          </div>
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
  const counts = [...Array.from({ length: Math.min(SPYGRID.maxCount, Math.max(1, myLeft)) }, (_, i) => i + 1), 0, UNLIMITED];
  return (
    <form
      className="flex flex-col gap-1.5 rounded-2xl bg-accent/10 p-2.5 ring-2 ring-accent"
      onSubmit={async (e) => {
        e.preventDefault();
        if (problem || !word.trim()) return;
        const res = await hubAct({ type: "clue", word: word.trim(), count });
        if (res.ok) setWord("");
      }}
      data-testid="clue-form"
    >
      <p className="font-display text-base leading-tight">Your clue! Tinted words are your key: one word + how many it points to.</p>
      <div className="flex gap-1.5">
        <input
          className="input min-h-11 min-w-0 flex-1 uppercase"
          value={word}
          maxLength={SPYGRID.clueMaxLength}
          placeholder="One word"
          aria-label="Clue word"
          autoComplete="off"
          autoCapitalize="characters"
          onChange={(e) => setWord(e.target.value.replace(/\s/g, ""))}
        />
        <select
          className="input min-h-11 w-[4.5rem] shrink-0 px-2 text-center font-display text-lg"
          value={count}
          aria-label="How many words it points to"
          onChange={(e) => setCount(Number(e.target.value))}
          data-testid="clue-count"
        >
          {counts.map((n) => (
            <option key={n} value={n}>
              {n === UNLIMITED ? "∞" : n}
            </option>
          ))}
        </select>
        <button className="btn-primary min-h-11 shrink-0 px-4" disabled={!word.trim() || !!problem}>
          <Send size={18} /> Give
        </button>
      </div>
      {problem && <p className="text-sm font-semibold text-bad">{problem}</p>}
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
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 py-1" data-testid="turn-end">
      <Banner color={TEAM_INFO[s.turn].color}>
        <span className="text-3xl sm:text-4xl">{text[last?.ended ?? ""] ?? "Turn over"}</span>
      </Banner>
      <p className="font-display text-xl">
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

  const turnInfo = TEAM_INFO[s.turn];
  return (
    <div className="flex flex-col gap-3" data-testid="spygrid">
      <Splash id={`turn-${s.turnNumber}`} color={turnInfo.color} sub={giver ? `${players[giver]?.name ?? "?"} gives the clue` : undefined}>
        {turnInfo.emoji} {turnInfo.name}&apos; turn!
      </Splash>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span
          className="flex items-center gap-1.5 rounded-2xl px-3 py-1 font-display text-lg text-[#14112a] sm:text-xl"
          style={chunky(turnInfo.color, { depth: 4 })}
        >
          {turnInfo.emoji} {turnInfo.name}&apos; turn
        </span>
        <span className="flex items-center gap-2 font-display text-lg" aria-label="Agents left">
          {(["a", "b"] as const).map((t) => (
            <span key={t} className="flex items-center gap-1 rounded-xl bg-bg/70 px-2 py-0.5" style={{ color: TEAM_INFO[t].color }}>
              {TEAM_INFO[t].emoji} {s.left[t]}
            </span>
          ))}
          {!display && myTeam && (
            <span className="hidden text-sm text-muted sm:inline">
              · you: {iAmGiver ? "clue-giver" : "guesser"}
            </span>
          )}
        </span>
      </div>
      {s.phaseEndsAt && <Timer endsAt={s.phaseEndsAt} totalMs={timerTotal} silent={!myTurn} />}

      <AnimatePresence mode="wait">
        {s.phase === "clue" && (
          <motion.div key="clue" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {!display && iAmGiver && myTurn ? (
              <ClueForm />
            ) : (
              <p className="flex items-center justify-center gap-2 rounded-2xl bg-bg/60 p-2.5 text-center font-display text-lg">
                <Avatar player={giver ? players[giver] : undefined} size={28} ring /> {giver ? players[giver]?.name : "?"} is thinking of a clue…
              </p>
            )}
          </motion.div>
        )}
        {s.phase === "guess" && s.clue && (
          <motion.div
            key={`guess-${s.turnNumber}`}
            initial={{ scale: 0.6, opacity: 0, rotate: -4 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 200, damping: 14 }}
            className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1"
            data-testid="clue"
          >
            <span className="flex items-center gap-2 rounded-2xl px-4 py-1.5 font-display text-3xl text-[#14112a] sm:text-4xl" style={chunky(turnInfo.color)}>
              {s.clue.word}
              <span className="rounded-xl bg-[#14112a] px-2 text-2xl text-white sm:text-3xl">{s.clue.count === UNLIMITED ? "∞" : s.clue.count}</span>
            </span>
            <span className="text-sm leading-tight text-muted">
              {s.guessesLeft >= 99 ? "Unlimited guesses" : `${s.guessesLeft} guess${s.guessesLeft === 1 ? "" : "es"} left`}
              {canVote ? ` · ${need > 1 ? `${need} votes reveal a word` : "tap a word to reveal it"}` : myTurn && iAmGiver ? " · no hints now!" : ""}
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
          className={iPassed ? "btn-primary min-h-11" : "btn-secondary min-h-11"}
          disabled={reveals === 0}
          onClick={() => (iPassed ? hubAct({ type: "vote", index: null }) : hubAct({ type: "pass" }))}
          data-testid="end-turn"
          title={reveals === 0 ? "Guess at least one word first" : undefined}
        >
          <SkipForward size={18} /> {iPassed ? "Take back" : "End our turn"} {passVotes > 0 && `(${passVotes}/${need})`}
        </button>
      )}
      {!display && !myTurn && myTeam && s.phase !== "turnEnd" && (
        <p className="text-center text-sm text-muted">The {TEAM_INFO[s.turn].name} are playing. Watch their picks!</p>
      )}
      {s.phase === "turnEnd" && <HubSkip />}
    </div>
  );
}
