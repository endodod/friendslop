"use client";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Lock, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { GAME_CONFIG, localize, type Answer, type PublicQuestionRound } from "@party-game/shared";
import { clientContent } from "@party-game/content";
import { useStore } from "@/lib/store";
import { serverNow, useNow } from "@/lib/time";
import { send } from "@/lib/socket";
import { act } from "@/lib/useRoom";
import { play } from "@/lib/sfx";
import { Avatar, CoinCount, Icon, PlayerName, ThemeBadge, Timer, usePlayers } from "../ui";
import { Confetti } from "../fx";
import { AnswerLabel, FORMAT_INPUTS, ScaleEnds } from "./formats";

const Q = GAME_CONFIG.question;

export function themeOf(id: string) {
  const t = clientContent.themes.find((x) => x.id === id);
  return t ? { name: localize(t.name), icon: t.icon, color: t.color } : undefined;
}

interface Props {
  round: PublicQuestionRound;
  /** Display = shared screen, no input. */
  display?: boolean;
  /** Override how answers are sent (question-only mini-games route through minigame:input). */
  onSubmit?: (a: Answer) => Promise<unknown>;
  /** Override own answer (mini-games keep it in their private state). */
  myAnswerOverride?: Answer | null;
  /** Hide coin amounts (mini-game intro questions pay bonuses instead). */
  rewardLabel?: string;
  totalAnswerMs?: number;
}

export function QuestionView({ round, display, onSubmit, myAnswerOverride, rewardLabel, totalAnswerMs }: Props) {
  const players = usePlayers();
  const playerId = useStore((s) => s.playerId);
  const priv = useStore((s) => s.priv);
  const target = players[round.targetId];
  const q = round.question;
  const theme = themeOf(q.themeId);
  const isTarget = playerId === round.targetId;
  const participant = !!playerId && round.participants.includes(playerId);
  const myAnswer = myAnswerOverride !== undefined ? myAnswerOverride : (priv?.myAnswer ?? null);

  useEffect(() => {
    if (round.stage === "intro") play("whoosh");
  }, [round.stage, round.uid]);

  return (
    <div className="flex w-full flex-col gap-4" data-testid="question-view">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ThemeBadge theme={theme} />
        {round.context === "mindReader" && (
          <span className="inline-flex items-center gap-1 rounded-full bg-[#818cf8] px-3 py-1 font-display text-sm text-[#14112a]">
            <Icon id="mind" size={16} /> Mind Reader · ×{round.multiplier} coins
          </span>
        )}
        {q.isData && (
          <span className="inline-flex items-center gap-1 rounded-full bg-[#2fd6d0] px-3 py-1 font-display text-sm text-[#14112a]">
            <Icon id="data" size={16} /> Real data · ×{round.multiplier} rewards
          </span>
        )}
      </div>

      <AnimatePresence mode="wait">
        {round.stage === "intro" ? (
          <motion.div
            key="intro"
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 1.2, opacity: 0 }}
            className="flex flex-col items-center gap-4 py-6 text-center"
          >
            <p className="font-display text-2xl text-muted">This one&apos;s about…</p>
            <motion.div animate={{ rotate: [0, -6, 6, 0] }} transition={{ repeat: Infinity, duration: 1.2 }}>
              <Avatar player={target} size={display ? 160 : 110} ring />
            </motion.div>
            <PlayerName player={target} className={display ? "text-7xl" : "text-5xl"} />
            {isTarget && <p className="font-display text-xl text-accent">That&apos;s you!</p>}
          </motion.div>
        ) : (
          <motion.div key="body" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <Avatar player={target} size={display ? 64 : 44} ring />
              <h2 className={`font-display leading-tight ${display ? "text-5xl" : "text-2xl sm:text-3xl"}`}>{q.prompt}</h2>
            </div>
            {q.number && (q.number.minLabel || q.number.maxLabel) && (
              <ScaleEnds min={q.number.min} max={q.number.max} minLabel={q.number.minLabel} maxLabel={q.number.maxLabel} />
            )}
            {round.stage === "answering" && (
              <Answering
                round={round}
                display={display}
                participant={participant}
                isTarget={isTarget}
                myAnswer={myAnswer}
                onSubmit={onSubmit}
                totalAnswerMs={totalAnswerMs}
              />
            )}
            {(round.stage === "reveal" || round.stage === "results") && (
              <Reveal round={round} display={display} rewardLabel={rewardLabel} />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Answering({
  round,
  display,
  participant,
  isTarget,
  myAnswer,
  onSubmit,
  totalAnswerMs,
}: {
  round: PublicQuestionRound;
  display?: boolean;
  participant: boolean;
  isTarget: boolean;
  myAnswer: Answer | null;
  onSubmit?: (a: Answer) => Promise<unknown>;
  totalAnswerMs?: number;
}) {
  const players = usePlayers();
  const priv = useStore((s) => s.priv);
  const [draft, setDraftState] = useState<Answer | null>(null);
  const [sending, setSending] = useState(false);
  /** Copycat: picking who to copy. */
  const [copyPicking, setCopyPicking] = useState<string | null>(null);
  const q = round.question;
  const Input = FORMAT_INPUTS[q.format];

  // Not locked in when time runs out? Your current selection still counts:
  // board rounds send it to the server as a hidden draft; mini-game rounds lock it in just before the end.
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<Answer | null>(null);
  const setDraft = (a: Answer) => {
    setDraftState(a);
    latest.current = a;
    if (onSubmit || !participant) return;
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => void send("question:draft", { answer: a }), 150);
  };
  useEffect(() => {
    if (!onSubmit || !participant || myAnswer) return;
    const ms = round.stageEndsAt - serverNow() - 700;
    const t = setTimeout(() => {
      if (latest.current) void onSubmit(latest.current);
    }, Math.max(0, ms));
    return () => clearTimeout(t);
  }, [onSubmit, participant, myAnswer, round.stageEndsAt]);
  const target = players[round.targetId];
  useEffect(() => {
    setDraftState(null);
    latest.current = null;
  }, [round.uid]);

  const items = (priv?.items ?? [])
    .map((id) => clientContent.items.find((i) => i.id === id))
    .filter((i) => i && i.useTiming === "onQuestion" && !isTarget && !myAnswer && !onSubmit)
    // Copycat needs someone else to copy.
    .filter((i) => i!.effect !== "copycat" || round.participants.some((p) => p !== round.targetId && p !== priv?.playerId));

  const lockIn = async () => {
    if (!draft) return;
    setSending(true);
    if (onSubmit) await onSubmit(draft);
    else await act("question:answer", { answer: draft });
    setSending(false);
  };

  return (
    <div className="flex flex-col gap-4">
      <Timer endsAt={round.stageEndsAt} totalMs={totalAnswerMs ?? Q.answerMs} />
      <div className="flex flex-wrap items-center gap-2" aria-label="Answered">
        {round.participants.map((pid) => {
          const done = round.answered.includes(pid);
          return (
            <motion.span
              key={pid}
              animate={done ? { scale: [1, 1.25, 1] } : {}}
              className="relative"
              title={`${players[pid]?.name}${done ? " locked in" : " thinking"}`}
            >
              <Avatar player={players[pid]} size={display ? 52 : 36} dim={!done} />
              {done && (
                <span className="absolute -bottom-1 -right-1 rounded-full bg-good p-0.5 text-[#06210f]">
                  <Check size={12} strokeWidth={4} />
                </span>
              )}
            </motion.span>
          );
        })}
        <span className="ml-1 text-sm text-muted">
          {round.answered.length}/{round.participants.length} locked in
        </span>
      </div>

      {participant && !display && !myAnswer && priv?.boosts.copy && (
        <p className="flex items-center justify-center gap-2 rounded-2xl bg-accent/15 p-4 text-center font-display text-xl text-accent">
          <Icon id="copycat" size={24} /> Copying {players[priv.boosts.copy]?.name}: you get whatever they lock in.
        </p>
      )}
      {participant && !display && !myAnswer && !priv?.boosts.copy && (
        <div className="flex flex-col gap-3">
          <p className="font-display text-lg text-accent">
            {isTarget
              ? q.isData
                ? "Guess your own stats! The real data decides."
                : "Answer honestly about yourself!"
              : q.format === "player" && !q.prompt.includes(target?.name ?? "\u0000")
                ? "Vote!"
                : `What will ${target?.name} answer?`}
          </p>
          <Input q={q} value={draft} onChange={setDraft} peek={priv?.peekCounts} />
          {items.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {items.map((it) => (
                <button
                  key={it!.id}
                  className="btn-secondary min-h-11 text-sm"
                  onClick={() => (it!.needsTarget ? setCopyPicking(it!.id) : act("turn:useItem", { itemId: it!.id }))}
                >
                  <Icon id={it!.icon} size={18} /> Use {localize(it!.name)}
                </button>
              ))}
            </div>
          )}
          {copyPicking && (
            <div className="card flex flex-col gap-2 p-3">
              <p className="font-display">Copy whose answer?</p>
              <div className="flex flex-wrap gap-2">
                {round.participants
                  .filter((pid) => pid !== round.targetId && pid !== priv?.playerId)
                  .map((pid) => (
                    <button
                      key={pid}
                      className="btn-secondary"
                      onClick={async () => {
                        await act("turn:useItem", { itemId: copyPicking, targetId: pid });
                        setCopyPicking(null);
                      }}
                    >
                      <Avatar player={players[pid]} size={28} /> {players[pid]?.name}
                    </button>
                  ))}
                <button className="btn-ghost" onClick={() => setCopyPicking(null)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
          {(priv?.boosts.wide || priv?.boosts.peek || priv?.boosts.double) && (
            <p className="text-sm text-good">
              <Sparkles size={14} className="inline" /> {priv.boosts.wide ? "Wide Tolerance active. " : ""}
              {priv.boosts.peek ? "Peek active: numbers show picks so far. " : ""}
              {priv.boosts.double ? "Lucky Charm: your coins from this question are doubled." : ""}
            </p>
          )}
          <button className="btn-primary min-h-14 text-2xl" disabled={!draft || sending} onClick={lockIn} data-testid="lock-in">
            <Lock size={20} /> Lock in
          </button>
        </div>
      )}
      {!participant && !display && (
        <p className="rounded-2xl bg-bg-2 p-3 text-center text-muted">
          Only {round.participants.filter((p) => p !== round.targetId).map((p) => players[p]?.name).join(" & ")} guesses this one. Watch!
        </p>
      )}
      {participant && !display && myAnswer && (
        <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="card flex flex-col items-center gap-2 p-4 text-center">
          <p className="font-display text-xl text-good">Locked in!</p>
          <AnswerLabel q={q} a={myAnswer} />
          <p className="text-sm text-muted">Waiting for the others…</p>
        </motion.div>
      )}
    </div>
  );
}

function Reveal({ round, display, rewardLabel }: { round: PublicQuestionRound; display?: boolean; rewardLabel?: string }) {
  const players = usePlayers();
  const playerId = useStore((s) => s.playerId);
  const now = useNow(100);
  const q = round.question;
  const guessers = round.revealOrder.filter((p) => p !== round.targetId);
  const isResults = round.stage === "results";
  const elapsed = isResults ? Infinity : now - round.stageStartedAt;
  const shownGuessers = isResults ? guessers.length : Math.min(guessers.length, Math.floor(elapsed / Q.revealPerAnswerMs) + 1);
  const targetPhaseStart = guessers.length * Q.revealPerAnswerMs;
  const targetFlipAt = targetPhaseStart + Q.targetRevealMs - 300;
  const drumming = elapsed >= targetPhaseStart && elapsed < targetFlipAt;
  const targetShown = elapsed >= targetFlipAt;
  const result = round.result;

  // sounds
  const lastShown = useRef(0);
  const played = useRef<string>("");
  useEffect(() => {
    if (shownGuessers > lastShown.current && !isResults) play("reveal", { volume: 0.4 });
    lastShown.current = shownGuessers;
  }, [shownGuessers, isResults]);
  useEffect(() => {
    if (drumming && played.current !== round.uid + "d") {
      played.current = round.uid + "d";
      play("drumroll");
    }
  }, [drumming, round.uid]);

  const me = playerId ? result?.perPlayer[playerId] : undefined;
  const confettiKey = targetShown && me?.match && !me.isTarget ? round.uid : null;
  useEffect(() => {
    if (confettiKey && me?.perfect) play("perfect");
  }, [confettiKey, me?.perfect]);

  const truthIsData = q.isData;
  const targetRes = result?.perPlayer[round.targetId];

  return (
    <div className="flex flex-col gap-3">
      <Confetti fireKey={confettiKey} count={me?.perfect ? 70 : 40} />
      <ul className={`grid gap-2 ${display ? "grid-cols-2" : "grid-cols-1"}`}>
        {guessers.slice(0, shownGuessers).map((pid) => {
          const r = result?.perPlayer[pid];
          return (
            <motion.li
              key={pid}
              initial={{ rotateX: 90, opacity: 0 }}
              animate={{ rotateX: 0, opacity: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 18 }}
              className={`relative flex items-center gap-3 rounded-2xl p-3 transition-colors ${
                targetShown && r?.match ? "bg-good/25 ring-2 ring-good" : "bg-bg-2"
              }`}
            >
              <Avatar player={players[pid]} size={display ? 48 : 36} />
              <div className="min-w-0 flex-1">
                <AnswerLabel q={q} a={r?.answer} />
              </div>
              {targetShown && r && <MatchBadge match={r.match} close={r.close} perfect={r.perfect && (q.format === "number" || q.format === "scale")} score={q.format === "ranking" ? r.score : undefined} />}
              {isResults && r && r.coins > 0 && <CoinCount value={r.coins} className="text-xl text-accent" />}
            </motion.li>
          );
        })}
      </ul>

      <div className="card relative flex flex-col items-center gap-2 overflow-hidden p-4 text-center" style={{ perspective: 800 }}>
        <p className="flex items-center gap-2 font-display text-lg text-muted">
          <Avatar player={players[round.targetId]} size={28} />
          {truthIsData ? `${players[round.targetId]?.name} guessed about themselves:` : `${players[round.targetId]?.name}'s answer`}
        </p>
        <AnimatePresence mode="wait">
          {!targetShown ? (
            <motion.div
              key="hidden"
              // Own finite transition: otherwise the exit inherits the drumroll's
              // `repeat: Infinity` and the answer never gets revealed.
              exit={{ rotateY: 90, scale: 1, rotate: 0, transition: { duration: 0.15 } }}
              animate={drumming ? { scale: [1, 1.08, 1], rotate: [0, -2, 2, 0] } : {}}
              transition={drumming ? { repeat: Infinity, duration: 0.3 } : undefined}
              className="flex h-16 w-40 items-center justify-center rounded-2xl bg-panel-2 font-display text-4xl text-muted"
            >
              ?
            </motion.div>
          ) : (
            <motion.div
              key="shown"
              initial={{ rotateY: -90, scale: 1.3 }}
              animate={{ rotateY: 0, scale: 1 }}
              transition={{ type: "spring", stiffness: 220, damping: 14 }}
              className="flex flex-col items-center gap-2"
            >
              <AnswerLabel q={q} a={targetRes?.answer} big />
              {truthIsData && (
                <>
                  <p className={`font-display text-xl ${result?.targetSelfCorrect ? "text-good" : "text-bad"}`}>
                    {result?.targetSelfCorrect ? "Knows themselves!" : "WRONG about themselves!"}
                  </p>
                  <p className="font-display text-lg text-muted">The real answer:</p>
                  <AnswerLabel q={q} a={result?.truth} big />
                  {q.truthLabel && <p className="text-muted">{q.truthLabel}</p>}
                </>
              )}
              {isResults && targetRes && targetRes.coins > 0 && (
                <CoinCount value={targetRes.coins} className="text-2xl text-accent" />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {isResults && result && (
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center font-display text-xl">
          {result.matchedCount === 0
            ? `Nobody matched ${players[round.targetId]?.name}!`
            : `${result.matchedCount} of ${result.guesserCount} matched!`}
          {rewardLabel && <span className="block text-base text-accent">{rewardLabel}</span>}
        </motion.p>
      )}
    </div>
  );
}

function MatchBadge({ match, perfect, close, score }: { match: boolean; perfect: boolean; close?: boolean; score?: number }) {
  return (
    <motion.span
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 font-display text-sm ${
        match ? (perfect ? "bg-accent text-[#241a00]" : "bg-good text-[#06210f]") : close ? "bg-[#ff8a3d] text-[#2a1200]" : "bg-bad/80 text-white"
      }`}
    >
      {match || close ? <Check size={14} strokeWidth={4} /> : <X size={14} strokeWidth={4} />}
      {perfect ? "PERFECT" : match ? "MATCH" : close ? "CLOSE" : "MISS"}
      {score !== undefined && ` ${Math.round(score * 100)}%`}
    </motion.span>
  );
}
