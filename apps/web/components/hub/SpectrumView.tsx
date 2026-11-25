"use client";
import { AnimatePresence, motion } from "framer-motion";
import { Lock, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { SPECTRUM, clueTextProblem, colorHex, type SpectrumPrivate, type SpectrumPublic } from "@party-game/shared";
import { useStore } from "@/lib/store";
import { Avatar, Icon, PlayerName, Timer, usePlayers } from "../ui";
import { Confetti } from "../fx";
import { HubSkip, Splash, chunky, hubAct, shade, useHubPriv, useHubState } from "./common";

const LEFT = "#3dd6c6";
const RIGHT = "#ff6bc6";

/** Steps of the scale: 1..10. */
const STEPS = Array.from({ length: SPECTRUM.max - SPECTRUM.min + 1 }, (_, i) => SPECTRUM.min + i);

function mix(a: string, b: string, t: number): string {
  const h = (x: string, i: number) => parseInt(x.slice(1 + i * 2, 3 + i * 2), 16);
  const c = [0, 1, 2].map((i) => Math.round(h(a, i) + (h(b, i) - h(a, i)) * t).toString(16).padStart(2, "0"));
  return `#${c.join("")}`;
}

/** Highlight of a step around the revealed (or, for the clue-giver, secret) target. */
const ZONE_BG = ["#ffc933", "#ffc93399", "#ffc93348"];

/**
 * The 1–10 scale between two opposites. Tappable steps when `onChange` is set; with `target` the
 * scoring zones light up; `markers` put players' avatars on the steps they picked.
 */
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
  const hasTarget = target !== null && target !== undefined;
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
      <div
        className={`grid grid-cols-10 ${big ? "gap-2" : "gap-1 sm:gap-1.5"}`}
        role={onChange ? "radiogroup" : undefined}
        aria-label={onChange ? `Your guess from ${SPECTRUM.min} (${left}) to ${SPECTRUM.max} (${right})` : undefined}
      >
        {STEPS.map((n, i) => {
          const d = hasTarget ? Math.abs(n - target!) : null;
          const zone = d !== null ? SPECTRUM.zones.findIndex((z) => d <= z.within) : -1;
          const selected = value === n;
          const here = markers.filter((m) => m.value === n);
          const base = mix(LEFT, RIGHT, i / (STEPS.length - 1));
          const Cell = onChange ? "button" : "div";
          return (
            <Cell
              key={n}
              {...(onChange
                ? { type: "button" as const, role: "radio", "aria-checked": selected, "aria-label": String(n), onClick: () => onChange(n), "data-testid": `step-${n}` }
                : {})}
              className={`relative flex min-w-0 flex-col items-center justify-start rounded-xl pt-1.5 transition-[transform,filter] ${
                big ? "min-h-28" : "min-h-16 sm:min-h-20"
              } ${onChange ? "cursor-pointer hover:brightness-110 active:translate-y-1" : ""} ${zone === 0 ? "z-10" : ""}`}
              style={{
                ...chunky(zone === 0 ? "#ffc933" : base, { depth: big ? 6 : 4 }),
                ...(zone > 0 ? { background: `linear-gradient(180deg, #ffffff38 0%, #ffffff00 45%), linear-gradient(${ZONE_BG[zone]}, ${ZONE_BG[zone]}), ${base}` } : {}),
                ...(selected ? { boxShadow: `0 0 0 3px #0d0b1a, 0 0 0 6px #fff, 0 4px 0 ${shade(base)}`, transform: "translateY(-4px)" } : {}),
                ...(zone === 0 ? { boxShadow: `0 ${big ? 6 : 4}px 0 #b38a12, 0 0 28px 6px #ffc93399` } : {}),
                opacity: hasTarget && zone < 0 && !here.length ? 0.55 : 1,
              }}
            >
              {zone === 0 && (
                <motion.span
                  aria-hidden
                  initial={{ scale: 0, rotate: -90 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 200, damping: 12 }}
                  className="absolute -top-4 text-[#ffe066] drop-shadow-[0_2px_0_#0008]"
                >
                  <Icon id="star" size={big ? 30 : 22} />
                </motion.span>
              )}
              <span
                className={`font-display leading-none drop-shadow-[0_2px_0_#0005] ${big ? "text-3xl" : "text-lg sm:text-xl"} ${zone === 0 ? "text-[#241a00]" : "text-white"}`}
              >
                {n}
              </span>
              {zone >= 0 && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.1 * zone }}
                  className="rounded-md bg-[#241a00cc] px-1 font-display text-xs text-[#ffe066]"
                >
                  +{SPECTRUM.zones[zone].points}
                </motion.span>
              )}
              {here.length > 0 && (
                <span className="mt-1 flex flex-col items-center -space-y-1.5">
                  {here.map((m, k) => (
                    <motion.span key={m.pid} initial={{ y: -12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.4 + k * 0.12 }}>
                      <Avatar player={players[m.pid]} size={big ? 34 : 22} ring />
                    </motion.span>
                  ))}
                </span>
              )}
            </Cell>
          );
        })}
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
        The target is <span className="font-display text-ink">{target}</span> of {SPECTRUM.max}. Any word, name or short phrase, but no
        numbers.
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
  const [value, setValue] = useState<number | null>(priv?.myGuess ?? null);
  const sent = useRef<number | null>(null);
  // Unlocked dials count when time runs out: keep the server up to date (throttled).
  useEffect(() => {
    if (locked || value === null) return;
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
          <button
            className="btn-primary min-h-14 text-2xl"
            disabled={value === null}
            onClick={() => value !== null && hubAct({ type: "guess", value })}
            data-testid="lock-guess"
          >
            <Lock size={20} /> {value === null ? "Pick a number" : `Lock in ${value}`}
          </button>
          <p className="text-center text-xs text-muted">Tap a number, then lock in. If time runs out, the number you picked counts.</p>
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
              <span className="text-sm text-muted">
                {r.guesses?.[pid]} · {zone?.label ?? `${d} off`}
              </span>
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
      <Splash id={`round-${r.index}`} color="#3dd6c6" sub={iAmGiver ? "You give the clue!" : `${giver?.name ?? "?"} gives the clue`}>
        Round {r.index + 1}
      </Splash>
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
              <motion.span
                initial={{ scale: 0.5, rotate: -6, opacity: 0 }}
                animate={{ scale: 1, rotate: -1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 180, damping: 12 }}
                className={`relative max-w-full break-words rounded-3xl bg-white px-5 py-2 font-display text-[#14112a] ${display ? "text-6xl" : "text-3xl sm:text-4xl"}`}
                style={{ boxShadow: `0 6px 0 ${colorHex(giver?.color ?? "")}, 0 10px 20px #0007` }}
              >
                {r.clue}
                <span aria-hidden className="absolute -bottom-3 left-8 h-5 w-5 rotate-45 bg-white" style={{ boxShadow: `4px 4px 0 ${colorHex(giver?.color ?? "")}` }} />
              </motion.span>
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
