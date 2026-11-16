"use client";
import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { GAME_CONFIG, localize, type Answer } from "@party-game/shared";
import { clientContent } from "@party-game/content";
import { MINIGAME_CLIENTS, type MinigameUiKit } from "@party-game/minigames/client";
import { useStore } from "@/lib/store";
import { serverNow, useRemaining } from "@/lib/time";
import { send } from "@/lib/socket";
import { play, vibrate } from "@/lib/sfx";
import { act } from "@/lib/useRoom";
import { Avatar, CoinCount, Icon, Timer, usePlayers } from "../ui";
import { AnswerLabel, FORMAT_INPUTS, ScaleEnds } from "../question/formats";
import { QuestionView } from "../question/QuestionView";
import { Confetti } from "../fx";
import { SkipButton } from "../game/PhasePanel";
import { HelpButton, MinigameTutorial, ReadyUp } from "../game/HowToPlay";

const M = GAME_CONFIG.minigame;

export const uiKit: MinigameUiKit = {
  Avatar: (p) => <Avatar {...p} />,
  QuestionRound: ({ round, display, myAnswer, onAnswer, totalAnswerMs }) => (
    <QuestionView round={round} display={display} myAnswerOverride={myAnswer} onSubmit={onAnswer} totalAnswerMs={totalAnswerMs} />
  ),
  Icon: (p) => <Icon {...p} />,
  AnswerInput: ({ question, value, onChange }) => {
    const Input = FORMAT_INPUTS[question.format];
    return <Input q={question} value={value} onChange={onChange} />;
  },
  AnswerLabel: ({ question, answer, big }) => <AnswerLabel q={question} a={answer} big={big} />,
  Timer: (p) => <Timer {...p} />,
  ScaleEnds: (p) => <ScaleEnds {...p} />,
  play,
  vibrate,
};

export function MinigameView({ display }: { display: boolean }) {
  const g = useStore((s) => s.pub!.game!);
  const mg = g.minigame;
  const meta = clientContent.minigames.find((m) => m.id === mg?.id);
  if (!mg || !meta) return null;
  switch (g.phase) {
    case "minigameIntro":
      return <Intro />;
    case "minigameQuestion":
      return g.question ? (
        <div className="flex flex-col gap-3">
          <p className="rounded-2xl bg-panel-2 px-4 py-2 text-center font-display">
            <Icon id={meta.icon} size={18} className="mr-1 align-[-3px]" /> Match the target to get a bonus in {localize(meta.name)}:{" "}
            <span className="text-accent">{localize(meta.bonus)}</span>
          </p>
          <QuestionView round={g.question} display={display} rewardLabel="Matchers get the mini-game bonus!" />
        </div>
      ) : null;
    case "minigameCountdown":
      return <Countdown />;
    case "minigamePlaying":
      return <Playing display={display} />;
    case "minigameResults":
      return <Results />;
    default:
      return null;
  }
}

function Intro() {
  const g = useStore((s) => s.pub!.game!);
  const mg = g.minigame!;
  const players = usePlayers();
  const meta = clientContent.minigames.find((m) => m.id === mg.id)!;
  useEffect(() => play("whoosh"), []);
  return (
    <div className="flex flex-col gap-4" data-testid="minigame-intro">
      <div className="flex items-center gap-4">
        <motion.div initial={{ scale: 0, rotate: -180 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 120 }}>
          <Icon id={meta.icon} size={72} className="text-accent" />
        </motion.div>
        <div>
          <p className="font-display text-lg text-muted">{mg.origin === "duel" ? "Duel!" : "Mini-game"}</p>
          <h2 className="font-display text-4xl leading-none sm:text-5xl">{localize(meta.name)}</h2>
        </div>
      </div>
      {mg.origin === "duel" && (
        <div className="flex items-center justify-center gap-3 font-display text-2xl">
          <Avatar player={players[mg.participants[0]]} size={48} /> vs <Avatar player={players[mg.participants[1]]} size={48} />
        </div>
      )}
      <MinigameTutorial id={mg.id} showBonus={mg.kind !== "questionOnly"} />
      {mg.kind !== "questionOnly" && (
        <p className="text-center text-sm text-muted">First a quick question. Match the target to get the bonus!</p>
      )}
      <Timer endsAt={g.phaseEndsAt} totalMs={mg.origin === "duel" ? 20000 : M.introMs} silent />
      <ReadyUp who={mg.participants} />
      <SkipButton />
    </div>
  );
}

/** Always-visible reminder of what you're trying to do, with the rules one tap away. */
function GoalBanner({ id }: { id: string }) {
  const meta = clientContent.minigames.find((m) => m.id === id);
  if (!meta) return null;
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-accent/15 px-3 py-2 ring-1 ring-accent/60">
      <Icon id={meta.icon} size={28} className="shrink-0 text-accent" />
      <p className="flex-1 leading-tight">
        <span className="font-display">{localize(meta.name)}</span>
        <span className="block text-sm text-ink/90">
          <span className="font-display text-accent">Goal:</span> {localize(meta.goal)}
        </span>
      </p>
      <HelpButton minigameId={id} />
    </div>
  );
}

function Countdown() {
  const g = useStore((s) => s.pub!.game!);
  const players = usePlayers();
  const playerId = useStore((s) => s.playerId);
  const mg = g.minigame!;
  const remaining = useRemaining(g.phaseEndsAt, 50);
  const n = Math.ceil(remaining / 1000);
  const [last, setLast] = useState(-1);
  useEffect(() => {
    if (n !== last) {
      setLast(n);
      if (n >= 1 && n <= 3) play("countdown");
      if (n === 0) play("go");
    }
  }, [n, last]);
  const iHaveBonus = playerId && mg.bonuses.includes(playerId);
  return (
    <div className="flex flex-col items-center gap-6 py-8 text-center">
      {mg.kind !== "questionOnly" && (
        <div className="flex flex-col items-center gap-2">
          <p className="font-display text-xl text-muted">Bonus</p>
          <div className="flex flex-wrap justify-center gap-2">
            {mg.bonuses.length === 0 ? (
              <span className="text-muted">Nobody got the bonus</span>
            ) : (
              mg.bonuses.map((pid) => <Avatar key={pid} player={players[pid]} size={44} ring />)
            )}
          </div>
          {iHaveBonus && <p className="font-display text-xl text-accent">You got the bonus!</p>}
        </div>
      )}
      <motion.p
        key={n}
        initial={{ scale: 2.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="font-display text-[9rem] leading-none text-accent"
      >
        {n > 3 ? "Ready?" : n > 0 ? n : "GO!"}
      </motion.p>
    </div>
  );
}

function Playing({ display }: { display: boolean }) {
  const g = useStore((s) => s.pub!.game!);
  const priv = useStore((s) => s.priv);
  const playerId = useStore((s) => s.playerId);
  const players = usePlayers();
  const mg = g.minigame!;
  const entry = MINIGAME_CLIENTS[mg.id];
  const isParticipant = !!playerId && (mg.inputPlayers ?? mg.participants).includes(playerId);
  const kitPlayers = useMemo(() => players, [players]);
  if (!entry) return <p className="text-center text-muted">This mini-game has no client yet.</p>;
  const C = entry.Component;
  return (
    <div className="flex flex-col gap-3" data-testid={`minigame-${mg.id}`}>
      <GoalBanner id={mg.id} />
      {!isParticipant && !display && (
        <p className="rounded-2xl bg-bg-2 p-2 text-center text-muted">You&apos;re watching this one.</p>
      )}
      <C
        pub={mg.state}
        priv={priv?.minigame ?? null}
        seed={priv?.minigameSeed ?? null}
        me={playerId}
        isParticipant={isParticipant && !display}
        participants={mg.participants}
        players={kitPlayers}
        bonus={!!playerId && mg.bonuses.includes(playerId)}
        startedAt={mg.startedAt}
        endsAt={mg.endsAt}
        now={serverNow}
        input={(input: unknown) => void send("minigame:input", { input })}
        submit={(submission: unknown) => void act("minigame:submit", { submission })}
        display={display}
        ui={uiKit}
      />
    </div>
  );
}

function Results() {
  const g = useStore((s) => s.pub!.game!);
  const players = usePlayers();
  const playerId = useStore((s) => s.playerId);
  const mg = g.minigame!;
  const meta = clientContent.minigames.find((m) => m.id === mg.id)!;
  const placements = mg.placements ?? [];
  const iWon = placements.some((p) => p.playerId === playerId && p.rank === 1);
  return (
    <div className="flex flex-col gap-4" data-testid="minigame-results">
      <Confetti fireKey={iWon ? `${mg.id}-${g.round}` : null} />
      <h2 className="text-center font-display text-4xl">{localize(meta.name)}: results</h2>
      <ol className="flex flex-col gap-2">
        {placements.map((p, i) => (
          <motion.li
            key={p.playerId}
            initial={{ x: -40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: (placements.length - i) * 0.25 }}
            className={`flex items-center gap-3 rounded-2xl p-3 ${p.rank === 1 ? "bg-accent/20 ring-2 ring-accent" : "bg-bg-2"}`}
          >
            <span className="w-8 text-center font-display text-3xl">{p.rank}</span>
            <Avatar player={players[p.playerId]} size={44} />
            <span className="flex-1 font-display text-xl">{players[p.playerId]?.name}</span>
            {p.label && <span className="text-muted">{p.label}</span>}
            {mg.payout && (
              <span className={`font-display text-xl ${(mg.payout[p.playerId] ?? 0) >= 0 ? "text-accent" : "text-bad"}`}>
                {(mg.payout[p.playerId] ?? 0) >= 0 ? <CoinCount value={mg.payout[p.playerId] ?? 0} /> : `${mg.payout[p.playerId]}`}
              </span>
            )}
          </motion.li>
        ))}
      </ol>
      <SkipButton />
    </div>
  );
}

export type { Answer };
void M;
