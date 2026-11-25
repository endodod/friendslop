"use client";
import { AnimatePresence, motion } from "framer-motion";
import { Lock, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { SPECTRUM, clueTextProblem, colorHex, type SpectrumPrivate, type SpectrumPublic } from "@party-game/shared";
import { useStore } from "@/lib/store";
import { Avatar, PlayerName, Timer, usePlayers } from "../ui";
import { Confetti } from "../fx";
import { HubSkip, hubAct, useHubPriv, useHubState } from "./common";

const LEFT = "#3dd6c6";
const RIGHT = "#ff6bc6";

/** Target zones drawn around `target` (outermost first). */
function Zones({ target }: { target: number }) {
  const zones = [...SPECTRUM.zones].reverse();
  return (
    <>
      {zones.map((z, i) => (
        <motion.div
          key={z.within}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ delay: 0.1 * i }}
          className="absolute inset-y-0 rounded-md"
          style={{
            left: `${Math.max(0, target - z.within - 0.5)}%`,
            width: `${Math.min(100, target + z.within + 0.5) - Math.max(0, target - z.within - 0.5)}%`,
            background: ["#ffc93355", "#ffc93399", "#ffc933"][i],
          }}
        >
          <span className="absolute inset-x-0 -top-5 text-center font-display text-xs text-accent">{i === zones.length - 1 ? z.points : ""}</span>
        </motion.div>
      ))}
    </>
  );
}

export function Dial({
  left,
  right,
  target,
  value,
  onChange,
  markers = [],
  big,
}: {
  left: string;
  right: string;
  target?: number | null;
  value?: number | null;
  onChange?: (v: number) => void;
  markers?: { pid: string; value: number }[];
  big?: boolean;
}) {
  const players = usePlayers();
  return (
    <div className="flex flex-col gap-2" data-testid="dial">
      <div className={`flex items-end justify-between gap-3 font-display ${big ? "text-3xl" : "text-lg sm:text-xl"}`}>
        <span className="min-w-0 max-w-[45%] leading-tight" style={{ color: LEFT }}>
          ← {left}
        </span>
        <span className="min-w-0 max-w-[45%] text-right leading-tight" style={{ color: RIGHT }}>
          {right} →
        </span>
      </div>
      <div className={`relative mt-5 ${big ? "h-20" : "h-14"} rounded-2xl`} style={{ background: `linear-gradient(90deg, ${LEFT}55, #2a2549 50%, ${RIGHT}55)` }}>
        <div className="absolute inset-x-2 inset-y-0">
          {target !== null && target !== undefined && <Zones target={target} />}
          {markers.map((m, i) => (
            <motion.span
              key={m.pid}
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.4 + i * 0.12 }}
              className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${m.value}%` }}
            >
              <Avatar player={players[m.pid]} size={big ? 40 : 30} ring />
            </motion.span>
          ))}
          {value !== null && value !== undefined && (
            <span className="pointer-events-none absolute inset-y-[-6px] w-1.5 -translate-x-1/2 rounded-full bg-white shadow-[0_0_0_3px_#0d0b1a]" style={{ left: `${value}%` }}>
              <span className="absolute -top-2 left-1/2 h-4 w-4 -translate-x-1/2 rounded-full bg-white shadow-[0_0_0_3px_#0d0b1a]" />
            </span>
          )}
        </div>
        {onChange && (
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={value ?? 50}
            onChange={(e) => onChange(Number(e.target.value))}
            aria-label={`Your guess between ${left} and ${right}`}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            data-testid="dial-input"
          />
        )}
      </div>
    </div>
  );
}

function ClueInput({ target }: { target: number }) {
  const [text, setText] = useState("");
  const problem = text.trim() ? clueTextProblem(text) : null;
  return (
    <form
      className="flex flex-col gap-2 rounded-2xl bg-accent/10 p-3 ring-2 ring-accent"
      onSubmit={async (e) => {
        e.preventDefault();
        if (problem || !text.trim()) return;
        await hubAct({ type: "clue", text: text.trim() });
      }}
      data-testid="spectrum-clue-form"
    >
      <p className="font-display text-xl">Only you see the target. Give a clue that sits right there!</p>
      <p className="text-sm text-muted">
        It&apos;s at {target} of 100. Any word, name or short phrase, but no numbers.
      </p>
      <div className="flex gap-2">
        <input
          className="input min-w-0 flex-1"
          value={text}
          maxLength={SPECTRUM.clueMaxLength}
          placeholder="e.g. Pineapple pizza"
          aria-label="Your clue"
          autoComplete="off"
          onChange={(e) => setText(e.target.value)}
        />
        <button className="btn-primary shrink-0" disabled={!text.trim() || !!problem}>
          <Send size={18} /> Send
        </button>
      </div>
      {problem && <p className="text-sm font-semibold text-bad">{problem}</p>}
    </form>
  );
}

function GuessControls() {
  const s = useHubState<SpectrumPublic>();
  const priv = useHubPriv<SpectrumPrivate>();
  const playerId = useStore((st) => st.playerId);
  const r = s.round!;
  const locked = !!playerId && r.locked.includes(playerId);
  const [value, setValue] = useState<number>(priv?.myGuess ?? 50);
  const sent = useRef(0);
  // Unlocked dials count when time runs out: keep the server up to date (throttled).
  useEffect(() => {
    if (locked) return;
    const t = setTimeout(() => {
      if (sent.current !== value) {
        sent.current = value;
        void hubAct({ type: "draft", value });
      }
    }, 250);
    return () => clearTimeout(t);
  }, [value, locked]);
  return (
    <div className="flex flex-col gap-3">
      <Dial left={r.card.left} right={r.card.right} value={locked ? (priv?.myGuess ?? value) : value} onChange={locked ? undefined : setValue} />
      {locked ? (
        <p className="flex items-center justify-center gap-2 rounded-2xl bg-bg-2 p-3 font-display text-lg text-muted">
          <Lock size={18} /> Locked in. Waiting for the others…
        </p>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <button className="btn-secondary min-w-12" aria-label="Move left" onClick={() => setValue((v) => Math.max(0, v - 1))}>
              ‹
            </button>
            <button className="btn-primary min-h-14 flex-1 text-2xl" onClick={() => hubAct({ type: "guess", value })} data-testid="lock-guess">
              <Lock size={20} /> Lock in
            </button>
            <button className="btn-secondary min-w-12" aria-label="Move right" onClick={() => setValue((v) => Math.min(100, v + 1))}>
              ›
            </button>
          </div>
          <p className="text-center text-xs text-muted">Drag the dial, then lock in. If time runs out, where your dial is counts.</p>
        </>
      )}
    </div>
  );
}

function Reveal({ display }: { display: boolean }) {
  const s = useHubState<SpectrumPublic>();
  const players = usePlayers();
  const r = s.round!;
  const markers = Object.entries(r.guesses ?? {}).map(([pid, value]) => ({ pid, value }));
  const pts = r.points ?? {};
  const guessers = markers.map((m) => m.pid).sort((a, b) => (pts[b] ?? 0) - (pts[a] ?? 0));
  const bull = guessers.some((p) => pts[p] === SPECTRUM.zones[0].points);
  return (
    <div className="flex flex-col gap-4" data-testid="spectrum-reveal">
      <Confetti fireKey={bull ? `bull-${r.index}` : null} count={50} />
      <Dial left={r.card.left} right={r.card.right} target={r.target} markers={markers} big={display} />
      <ul className="grid gap-2 sm:grid-cols-2">
        {guessers.map((pid) => {
          const d = Math.abs((r.guesses?.[pid] ?? 0) - (r.target ?? 0));
          const zone = SPECTRUM.zones.find((z) => d <= z.within);
          return (
            <li key={pid} className="flex items-center gap-2 rounded-2xl bg-bg-2 px-3 py-2">
              <Avatar player={players[pid]} size={28} />
              <PlayerName player={players[pid]} className="min-w-0 flex-1 truncate" />
              <span className="text-sm text-muted">{zone?.label ?? `off by ${d}`}</span>
              <span className={`font-display text-xl ${pts[pid] ? "text-good" : "text-muted"}`}>+{pts[pid] ?? 0}</span>
            </li>
          );
        })}
        <li className="flex items-center gap-2 rounded-2xl bg-accent/15 px-3 py-2 sm:col-span-2">
          <Avatar player={players[r.giverId]} size={28} />
          <span className="min-w-0 flex-1 truncate">
            <PlayerName player={players[r.giverId]} /> <span className="text-sm text-muted">(clue-giver, average)</span>
          </span>
          <span className="font-display text-xl text-good">+{pts[r.giverId] ?? 0}</span>
        </li>
      </ul>
      <HubSkip label="Next round" />
    </div>
  );
}

export function SpectrumView({ display }: { display: boolean; controller?: boolean }) {
  const s = useHubState<SpectrumPublic>();
  const priv = useHubPriv<SpectrumPrivate>();
  const playerId = useStore((st) => st.playerId);
  const players = usePlayers();
  const r = s.round;
  if (!r) return <p className="py-10 text-center font-display text-3xl">Get ready…</p>;
  const giver = players[r.giverId];
  const iAmGiver = playerId === r.giverId;
  const total = s.phaseEndsAt ? s.phaseEndsAt - s.phaseStartedAt : 0;
  return (
    <div className="flex flex-col gap-4" data-testid="spectrum">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-display text-xl">
          <Avatar player={giver} size={34} ring /> {iAmGiver ? "You give the clue" : `${giver?.name} gives the clue`}
        </span>
        <span className="text-sm text-muted">
          Round {r.index + 1}/{s.totalRounds}
        </span>
      </div>
      {s.phase !== "reveal" && s.phaseEndsAt && <Timer endsAt={s.phaseEndsAt} totalMs={total} silent={display} />}

      <AnimatePresence mode="wait">
        <motion.div key={s.phase + r.index} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-col gap-4">
          {r.clue && (
            <div className="flex flex-col items-center gap-1 text-center" data-testid="spectrum-clue">
              <span className="text-sm text-muted">Clue</span>
              <span
                className={`max-w-full break-words rounded-2xl bg-panel-2 px-5 py-2 font-display ${display ? "text-6xl" : "text-3xl sm:text-4xl"}`}
                style={{ boxShadow: `inset 0 0 0 3px ${colorHex(giver?.color ?? "")}` }}
              >
                “{r.clue}”
              </span>
            </div>
          )}

          {s.phase === "clue" &&
            (iAmGiver && !display && priv?.target != null ? (
              <>
                <Dial left={r.card.left} right={r.card.right} target={priv.target} />
                <ClueInput target={priv.target} />
              </>
            ) : (
              <>
                <Dial left={r.card.left} right={r.card.right} big={display} />
                <p className="text-center font-display text-xl text-muted">{giver?.name} sees the target and is thinking of a clue…</p>
              </>
            ))}

          {s.phase === "guess" &&
            (display ? (
              <>
                <Dial left={r.card.left} right={r.card.right} big />
                <p className="text-center font-display text-xl text-muted">
                  {r.locked.length}/{s.players.length - 1} locked in
                </p>
              </>
            ) : iAmGiver ? (
              <>
                <Dial left={r.card.left} right={r.card.right} target={priv?.target ?? null} />
                <p className="text-center font-display text-xl text-muted">Your friends are guessing… no hints!</p>
              </>
            ) : (
              <GuessControls key={r.index} />
            ))}

          {s.phase === "reveal" && <Reveal display={display} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
