"use client";
import { Reorder, motion } from "framer-motion";
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, GripVertical, Minus, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { answerKey, type Answer, type PublicQuestionRound, type QuestionFormat } from "@party-game/shared";
import { Avatar, usePlayers } from "../ui";

type Q = PublicQuestionRound["question"];

export interface FormatInputProps {
  q: Q;
  value: Answer | null;
  onChange: (a: Answer) => void;
  /** Peek item: counts per answer key */
  peek?: Record<string, number> | null;
}

const OPTION_COLORS = ["#3d8bff", "#ff4d5e", "#2fd27a", "#ffc933", "#b26bff", "#ff8a3d"];
const OPTION_SHAPES = ["▲", "◆", "●", "■", "★", "✚"];

function PeekBadge({ n }: { n: number | undefined }) {
  if (n === undefined) return null;
  return (
    <span className="absolute -right-2 -top-2 rounded-full bg-white px-2 font-display text-sm text-[#14112a] shadow" title="Peek">
      {n}
    </span>
  );
}

function TilesInput({ q, value, onChange, peek }: FormatInputProps) {
  const opts = q.options ?? [];
  return (
    <div className={`grid gap-3 ${opts.length > 2 ? "grid-cols-2" : "grid-cols-1"}`}>
      {opts.map((o, i) => {
        const sel = value?.kind === "option" && value.optionId === o.id;
        return (
          <motion.button
            key={o.id}
            whileTap={{ scale: 0.95 }}
            onClick={() => onChange({ kind: "option", optionId: o.id })}
            aria-pressed={sel}
            className="relative flex min-h-20 items-center gap-2 rounded-2xl p-3 text-left font-display text-lg leading-tight text-white transition-all sm:text-xl"
            style={{
              background: OPTION_COLORS[i % 6],
              boxShadow: sel ? "0 0 0 4px #0d0b1a, 0 0 0 8px #fff" : "0 5px 0 #0005",
              opacity: value && !sel ? 0.55 : 1,
            }}
          >
            <span aria-hidden className="text-2xl opacity-70">{OPTION_SHAPES[i % 6]}</span>
            <span className="drop-shadow-[0_2px_0_#0004]">{o.label}</span>
            <PeekBadge n={peek ? (peek[`o:${o.id}`] ?? 0) : undefined} />
          </motion.button>
        );
      })}
    </div>
  );
}

function clampStep(v: number, min: number, max: number, step: number) {
  const k = Math.round((v - min) / step);
  return Math.min(max, Math.max(min, +(min + k * step).toFixed(6)));
}

function NumberInput({ q, value, onChange }: FormatInputProps) {
  const spec = q.number!;
  const initial = value?.kind === "number" ? value.value : clampStep((spec.min + spec.max) / 2, spec.min, spec.max, spec.step);
  const [v, setV] = useState(initial);
  const [text, setText] = useState(String(initial));
  useEffect(() => {
    onChange({ kind: "number", value: v });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const set = (n: number) => {
    const c = clampStep(n, spec.min, spec.max, spec.step);
    setV(c);
    setText(String(c));
    onChange({ kind: "number", value: c });
  };
  const bigStep = Math.max(spec.step, Math.round((spec.max - spec.min) / 20 / spec.step) * spec.step);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-center gap-3">
        <button className="btn-secondary min-w-14" aria-label="Decrease" onClick={() => set(v - spec.step)}>
          <Minus />
        </button>
        <label className="flex items-baseline gap-2">
          <input
            className="w-36 rounded-2xl border-2 border-line bg-bg-2 py-2 text-center font-display text-5xl tabular-nums outline-none focus:border-accent"
            inputMode="decimal"
            aria-label="Your answer"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              const n = Number(e.target.value.replace(",", "."));
              if (e.target.value !== "" && Number.isFinite(n)) {
                const c = clampStep(n, spec.min, spec.max, spec.step);
                setV(c);
                onChange({ kind: "number", value: c });
              }
            }}
            onBlur={() => setText(String(v))}
          />
          {spec.unit && <span className="font-display text-xl text-muted">{spec.unit}</span>}
        </label>
        <button className="btn-secondary min-w-14" aria-label="Increase" onClick={() => set(v + spec.step)}>
          <Plus />
        </button>
      </div>
      <input
        type="range"
        min={spec.min}
        max={spec.max}
        step={spec.step}
        value={v}
        aria-label="Answer slider"
        onChange={(e) => set(Number(e.target.value))}
        className="h-10 w-full accent-[#ffc933]"
      />
      <div className="flex justify-between text-sm text-muted">
        <button className="min-h-11 px-2" onClick={() => set(v - bigStep)}>
          −{bigStep}
        </button>
        <span>
          {spec.min} – {spec.max}
        </span>
        <button className="min-h-11 px-2" onClick={() => set(v + bigStep)}>
          +{bigStep}
        </button>
      </div>
    </div>
  );
}

function ScaleInput({ q, value, onChange }: FormatInputProps) {
  const spec = q.number ?? { min: 1, max: 10, step: 1 };
  const vals: number[] = [];
  for (let n = spec.min; n <= spec.max; n += spec.step) vals.push(n);
  return (
    <div className="flex flex-col gap-2">
    <div className="grid grid-cols-5 gap-2">
      {vals.map((n) => {
        const sel = value?.kind === "number" && value.value === n;
        const hue = 200 - ((n - spec.min) / (spec.max - spec.min || 1)) * 200;
        return (
          <motion.button
            key={n}
            whileTap={{ scale: 0.9 }}
            aria-pressed={sel}
            onClick={() => onChange({ kind: "number", value: n })}
            className="min-h-16 rounded-2xl font-display text-3xl text-[#14112a]"
            style={{
              background: `hsl(${hue} 85% 62%)`,
              boxShadow: sel ? "0 0 0 4px #0d0b1a, 0 0 0 8px #fff" : "0 4px 0 #0005",
              opacity: value && !sel ? 0.5 : 1,
            }}
          >
            {n}
          </motion.button>
        );
      })}
    </div>
    </div>
  );
}

/** "1 = spotless … 10 = disaster zone": what the ends of a scale mean. */
export function ScaleEnds({ min, max, minLabel, maxLabel }: { min: number; max: number; minLabel?: string; maxLabel?: string }) {
  if (!minLabel && !maxLabel) return null;
  return (
    <div className="flex items-stretch justify-between gap-3 text-sm">
      <span className="flex max-w-[48%] items-center gap-2 rounded-xl bg-[hsl(200_85%_62%/0.18)] px-3 py-1.5">
        <span className="font-display text-lg text-[hsl(200_85%_70%)]">{min}</span>
        <span className="leading-tight">= {minLabel}</span>
      </span>
      <span className="flex max-w-[48%] items-center gap-2 rounded-xl bg-[hsl(0_85%_62%/0.18)] px-3 py-1.5 text-right">
        <span className="leading-tight">{maxLabel} =</span>
        <span className="font-display text-lg text-[hsl(0_85%_72%)]">{max}</span>
      </span>
    </div>
  );
}

function PlayerInput({ q, value, onChange, peek }: FormatInputProps) {
  const players = usePlayers();
  return (
    <div className="grid grid-cols-2 gap-3">
      {(q.playerChoices ?? []).map((pid) => {
        const p = players[pid];
        const sel = value?.kind === "player" && value.playerId === pid;
        return (
          <motion.button
            key={pid}
            whileTap={{ scale: 0.95 }}
            aria-pressed={sel}
            onClick={() => onChange({ kind: "player", playerId: pid })}
            className="relative flex min-h-20 items-center gap-3 rounded-2xl bg-panel-2 p-3 font-display text-xl"
            style={{ boxShadow: sel ? "0 0 0 4px #0d0b1a, 0 0 0 8px #fff" : "0 5px 0 #0005", opacity: value && !sel ? 0.55 : 1 }}
          >
            <Avatar player={p} size={48} />
            <span className="truncate">{p?.name}</span>
            <PeekBadge n={peek ? (peek[`p:${pid}`] ?? 0) : undefined} />
          </motion.button>
        );
      })}
    </div>
  );
}

function RankingInput({ q, value, onChange }: FormatInputProps) {
  const opts = q.options ?? [];
  const [order, setOrder] = useState<string[]>(value?.kind === "order" ? value.optionIds : opts.map((o) => o.id));
  useEffect(() => {
    onChange({ kind: "order", optionIds: order });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const update = (next: string[]) => {
    setOrder(next);
    onChange({ kind: "order", optionIds: next });
  };
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    update(next);
  };
  return (
    <Reorder.Group axis="y" values={order} onReorder={update} className="flex flex-col gap-2">
      {order.map((id, i) => {
        const o = opts.find((x) => x.id === id)!;
        return (
          <Reorder.Item
            key={id}
            value={id}
            className="flex min-h-14 touch-none items-center gap-2 rounded-2xl bg-panel-2 p-2 font-display text-xl shadow-[0_4px_0_#0005]"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-[#241a00]">{i + 1}</span>
            <GripVertical className="text-muted" size={20} aria-hidden />
            <span className="flex-1">{o?.label}</span>
            <button className="btn-ghost min-h-11 min-w-11 px-1" aria-label={`Move ${o?.label} up`} onClick={() => move(i, -1)}>
              <ChevronUp />
            </button>
            <button className="btn-ghost min-h-11 min-w-11 px-1" aria-label={`Move ${o?.label} down`} onClick={() => move(i, 1)}>
              <ChevronDown />
            </button>
          </Reorder.Item>
        );
      })}
    </Reorder.Group>
  );
}

function HigherLowerInput({ q, value, onChange, peek }: FormatInputProps) {
  return (
    <div className="flex flex-col gap-3">
      {q.reference !== undefined && (
        <div className="text-center font-display text-6xl text-accent">
          {q.reference}
          {q.number?.unit && <span className="ml-2 text-2xl text-muted">{q.number.unit}</span>}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        {(["higher", "lower"] as const).map((dir) => {
          const sel = value?.kind === "hl" && value.dir === dir;
          return (
            <motion.button
              key={dir}
              whileTap={{ scale: 0.95 }}
              aria-pressed={sel}
              onClick={() => onChange({ kind: "hl", dir })}
              className="relative flex min-h-24 flex-col items-center justify-center gap-1 rounded-2xl font-display text-2xl text-white"
              style={{
                background: dir === "higher" ? "#2fd27a" : "#ff4d5e",
                boxShadow: sel ? "0 0 0 4px #0d0b1a, 0 0 0 8px #fff" : "0 5px 0 #0005",
                opacity: value && !sel ? 0.55 : 1,
              }}
            >
              {dir === "higher" ? <ArrowUp size={36} /> : <ArrowDown size={36} />}
              {dir === "higher" ? "Higher" : "Lower"}
              <PeekBadge n={peek ? (peek[`h:${dir}`] ?? 0) : undefined} />
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

/** Answer input UI per format. Add a new format: implement an input + label here and a rule in shared/formats. */
export const FORMAT_INPUTS: Record<QuestionFormat, (p: FormatInputProps) => React.ReactElement> = {
  tiles: TilesInput,
  number: NumberInput,
  scale: ScaleInput,
  player: PlayerInput,
  ranking: RankingInput,
  higherLower: HigherLowerInput,
};

/** Renders an answer compactly (reveal, results). */
export function AnswerLabel({ q, a, big }: { q: Q; a: Answer | null | undefined; big?: boolean }) {
  const players = usePlayers();
  const cls = big ? "text-3xl sm:text-4xl" : "text-lg";
  if (!a) return <span className={`font-display text-muted ${cls}`}>No answer</span>;
  switch (a.kind) {
    case "option": {
      const i = q.options?.findIndex((o) => o.id === a.optionId) ?? -1;
      return (
        <span
          className={`inline-flex items-center gap-2 rounded-xl px-3 py-1 font-display text-white ${cls}`}
          style={{ background: OPTION_COLORS[(i < 0 ? 0 : i) % 6] }}
        >
          <span aria-hidden className="opacity-70">{OPTION_SHAPES[(i < 0 ? 0 : i) % 6]}</span>
          {q.options?.[i]?.label ?? "?"}
        </span>
      );
    }
    case "number":
      return (
        <span className={`font-display tabular-nums ${cls}`}>
          {a.value}
          {q.format === "scale" && <span className="ml-0.5 text-[0.6em] text-muted">/{q.number?.max ?? 10}</span>}
          {q.number?.unit && <span className="ml-1 text-[0.6em] text-muted">{q.number.unit}</span>}
        </span>
      );
    case "player":
      return (
        <span className={`inline-flex items-center gap-2 font-display ${cls}`}>
          <Avatar player={players[a.playerId]} size={big ? 44 : 28} />
          {players[a.playerId]?.name}
        </span>
      );
    case "hl":
      return (
        <span className={`inline-flex items-center gap-1 font-display ${cls} ${a.dir === "higher" ? "text-good" : "text-bad"}`}>
          {a.dir === "higher" ? <ArrowUp /> : <ArrowDown />}
          {a.dir === "higher" ? "Higher" : "Lower"}
        </span>
      );
    case "order":
      return (
        <ol className={`flex flex-col gap-0.5 text-left font-display ${big ? "text-2xl" : "text-sm"}`}>
          {a.optionIds.map((id, i) => (
            <li key={id}>
              {i + 1}. {q.options?.find((o) => o.id === id)?.label}
            </li>
          ))}
        </ol>
      );
  }
}

export { answerKey };
