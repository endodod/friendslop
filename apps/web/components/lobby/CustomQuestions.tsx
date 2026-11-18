"use client";
import { BookmarkPlus, Check, ChevronDown, Pencil, Plus, Trash2, Upload, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { BRANDING, CUSTOM_LIMITS, type CustomQuestion, type CustomQuestionDraft } from "@party-game/shared";
import { useStore } from "@/lib/store";
import { act } from "@/lib/useRoom";
import { Avatar, useIsHost, usePlayers } from "../ui";
import { loadSavedQuestions, promptKey, saveQuestions, useAccount } from "@/lib/account";

type Format = CustomQuestionDraft["format"];
export const FORMATS: { id: Format; label: string; hint: string }[] = [
  { id: "tiles", label: "Multiple choice", hint: "2–6 answers" },
  { id: "scale", label: "1–10 scale", hint: "rate something" },
  { id: "number", label: "Number", hint: "guess a number" },
  { id: "player", label: "Pick a player", hint: "who would…" },
];

const SAVED_KEY = `${BRANDING.storagePrefix}:customQuestions`;

/** Questions saved on this device (works without an account). */
export function loadSaved(): CustomQuestionDraft[] {
  try {
    return JSON.parse(localStorage.getItem(SAVED_KEY) ?? "[]") as CustomQuestionDraft[];
  } catch {
    return [];
  }
}
function saveDraft(d: CustomQuestionDraft) {
  try {
    const all = loadSaved().filter((x) => x.prompt.toLowerCase() !== d.prompt.toLowerCase());
    localStorage.setItem(SAVED_KEY, JSON.stringify([...all, d].slice(-100)));
  } catch {
    /* private mode */
  }
}

/** Shows {target} as a highlighted name chip. */
export function PromptPreview({ text, name }: { text: string; name: string }) {
  const parts = text.split(/(\{target\}|\{player:random\}|\{otherPlayer\})/);
  return (
    <span>
      {parts.map((p, i) =>
        p.startsWith("{") ? (
          <span key={i} className="rounded-md bg-accent/25 px-1 font-semibold text-accent">
            {p === "{target}" ? name : "another player"}
          </span>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </span>
  );
}

export function CustomQuestions() {
  const pub = useStore((s) => s.pub)!;
  const playerId = useStore((s) => s.playerId);
  const isHost = useIsHost();
  const players = usePlayers();
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState<CustomQuestionDraft[]>([]);
  useEffect(() => setSaved(loadSaved()), [open]);
  const user = useAccount((s) => s.user);

  const list = pub.customQuestions ?? [];
  const inRoom = new Set(list.map((c) => String(c.question.prompt).toLowerCase()));
  const notYetAdded = saved.filter((d) => !inRoom.has(promptKey(d.prompt)));

  async function addToRoom(d: CustomQuestionDraft): Promise<boolean> {
    const res = await act("custom:add", { question: d });
    if (!res.ok) return false;
    saveDraft(d);
    // Signed in: keep it on the profile too, for any device.
    if (useAccount.getState().user) {
      const err = await saveQuestions([d]);
      if (err) useStore.getState().toast(err, "error");
    }
    useStore.getState().toast("Question added!", "good");
    return true;
  }

  return (
    <section className="card flex flex-col gap-3 p-5" data-testid="custom-questions">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-2xl">
          <Pencil size={20} /> Custom questions <span className="text-base text-muted">{list.length}</span>
        </h2>
        {playerId && !open && (
          <button className="btn-primary min-h-11 text-base" onClick={() => setOpen(true)}>
            <Plus size={18} /> Write one
          </button>
        )}
      </div>
      <p className="text-sm text-muted">
        Questions about your group, written by you. They go into the <b>Custom</b> pack (switch it on or off under Question
        packs) and come up more often than regular questions.
      </p>

      {open && playerId && (
        <QuestionEditor
          onClose={() => setOpen(false)}
          onSubmit={addToRoom}
          submitLabel="Add to Custom pack"
          footnote={
            user
              ? "Your questions are also saved on your profile, so you can load them into any room."
              : "Your questions are also saved on this device. Sign in to keep them on your profile."
          }
        />
      )}

      {playerId && user && <SavedOnProfile inRoom={inRoom} />}

      {playerId && !user && notYetAdded.length > 0 && (
        <button
          className="btn-secondary min-h-11 self-start text-sm"
          onClick={async () => {
            for (const d of notYetAdded) await act("custom:add", { question: d });
          }}
        >
          <Upload size={16} /> Add my {notYetAdded.length} saved question{notYetAdded.length > 1 ? "s" : ""}
        </button>
      )}

      {list.length > 0 && (
        <ul className="flex flex-col gap-2">
          {list.map((c: CustomQuestion) => (
            <li key={c.id} className="flex items-start gap-3 rounded-2xl bg-bg-2 p-3">
              <Avatar player={players[c.authorId] ?? { id: c.authorId, name: c.authorName, color: "purple" }} size={30} />
              <div className="min-w-0 flex-1">
                <p className="leading-snug">
                  <PromptPreview text={String(c.question.prompt)} name="[player]" />
                </p>
                <p className="text-xs text-muted">
                  {FORMATS.find((f) => f.id === c.question.format)?.label} · by {c.authorName}
                  {c.question.answers && ` · ${c.question.answers.map(String).join(" / ")}`}
                </p>
              </div>
              {(c.authorId === playerId || isHost) && (
                <button className="btn-ghost min-h-11 min-w-11 px-2" aria-label="Remove question" onClick={() => act("custom:remove", { id: c.id })}>
                  <Trash2 size={18} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Lobby: load questions saved on your profile straight into this room. */
function SavedOnProfile({ inRoom }: { inRoom: Set<string> }) {
  const questions = useAccount((s) => s.questions);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void loadSavedQuestions();
  }, []);
  if (!questions?.length) return null;
  const missing = questions.filter((q) => !inRoom.has(promptKey(q.draft.prompt)));
  const addAll = async () => {
    setBusy(true);
    let n = 0;
    for (const q of missing) if ((await act("custom:add", { question: q.draft })).ok) n++;
    setBusy(false);
    if (n) useStore.getState().toast(`Added ${n} question${n > 1 ? "s" : ""} from your profile`, "good");
  };
  return (
    <div className="rounded-2xl bg-bg-2 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button className="flex min-h-11 items-center gap-2 font-display text-lg" aria-expanded={open} onClick={() => setOpen(!open)}>
          <ChevronDown size={18} className={`transition-transform ${open ? "" : "-rotate-90"}`} />
          Saved on your profile <span className="text-sm text-muted">{questions.length}</span>
        </button>
        {missing.length > 0 && (
          <button className="btn-secondary min-h-11 text-sm" disabled={busy} onClick={addAll} data-testid="add-all-saved">
            <Upload size={16} /> Add {missing.length === questions.length ? "all" : `${missing.length} more`}
          </button>
        )}
      </div>
      {open && (
        <ul className="mt-2 flex flex-col gap-2">
          {questions.map((q) => {
            const added = inRoom.has(promptKey(q.draft.prompt));
            return (
              <li key={q.id} className="flex items-center gap-2 rounded-xl bg-panel p-2 pl-3">
                <div className="min-w-0 flex-1">
                  <p className="leading-snug">
                    <PromptPreview text={q.draft.prompt} name="[player]" />
                  </p>
                  <p className="text-xs text-muted">{FORMATS.find((f) => f.id === q.draft.format)?.label}</p>
                </div>
                {added ? (
                  <span className="flex items-center gap-1 px-2 text-sm text-good">
                    <Check size={16} /> Added
                  </span>
                ) : (
                  <button className="btn-secondary min-h-11 px-3 text-sm" onClick={() => act("custom:add", { question: q.draft })}>
                    <Plus size={16} /> Add
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** The question form. Used in the lobby (adds to the room) and on the profile (saves to the account). */
export function QuestionEditor({
  onClose,
  onSubmit,
  submitLabel,
  footnote,
}: {
  onClose: () => void;
  onSubmit: (d: CustomQuestionDraft) => Promise<boolean>;
  submitLabel: string;
  footnote?: string;
}) {
  const players = usePlayers();
  const playerId = useStore((s) => s.playerId);
  const sampleName = useMemo(() => Object.values(players).find((p) => p.id !== playerId)?.name ?? "Sam", [players, playerId]);
  const [format, setFormat] = useState<Format>("tiles");
  const [prompt, setPrompt] = useState("");
  const [answers, setAnswers] = useState(["", "", "", ""]);
  const [min, setMin] = useState(0);
  const [max, setMax] = useState(100);
  const [unit, setUnit] = useState("");
  const [minLabel, setMinLabel] = useState("");
  const [maxLabel, setMaxLabel] = useState("");
  const [busy, setBusy] = useState(false);

  const draft = (): CustomQuestionDraft => {
    switch (format) {
      case "tiles":
        return { format, prompt, answers: answers.map((a) => a.trim()).filter(Boolean) };
      case "number":
        return { format, prompt, min, max, unit: unit.trim() || undefined };
      case "scale":
        return { format, prompt, minLabel, maxLabel };
      case "player":
        return { format, prompt };
    }
  };
  const hasTarget = prompt.includes("{target}");

  return (
    <form
      className="flex flex-col gap-3 rounded-2xl border-2 border-accent/50 bg-bg-2 p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const ok = await onSubmit(draft());
        setBusy(false);
        if (ok) {
          setPrompt("");
          setAnswers(["", "", "", ""]);
          setMinLabel("");
          setMaxLabel("");
        }
      }}
    >
      <div className="flex items-center justify-between">
        <span className="font-display text-xl">New question</span>
        <button type="button" className="btn-ghost min-h-11 min-w-11 px-2" aria-label="Close editor" onClick={onClose}>
          <X />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Question type">
        {FORMATS.map((f) => (
          <button
            key={f.id}
            type="button"
            role="radio"
            aria-checked={format === f.id}
            onClick={() => setFormat(f.id)}
            className={`flex min-h-12 flex-col items-center justify-center rounded-xl px-2 py-1 ${format === f.id ? "bg-accent text-[#241a00]" : "bg-panel-2 text-muted"}`}
          >
            <span className="font-display">{f.label}</span>
            <span className="text-xs opacity-80">{f.hint}</span>
          </button>
        ))}
      </div>

      <label className="flex flex-col gap-1">
        <span className="font-display">Question</span>
        <textarea
          className="input min-h-20 py-2"
          maxLength={CUSTOM_LIMITS.promptMax}
          placeholder={format === "player" ? "Who would {target} trust with their secrets?" : "What does {target} eat for breakfast?"}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
      </label>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <button type="button" className="btn-secondary min-h-11 text-sm" onClick={() => setPrompt((p) => `${p}${p && !p.endsWith(" ") ? " " : ""}{target}`)}>
          + insert {"{target}"}
        </button>
        <span className="text-muted">= the player the question is about</span>
      </div>
      {prompt && (
        <p className="rounded-xl bg-panel-2 p-3 text-lg">
          <span className="mr-2 text-xs text-muted">Preview:</span>
          <PromptPreview text={prompt} name={sampleName} />
          {!hasTarget && <span className="mt-1 block text-sm text-bad">Add {"{target}"} where the player&apos;s name goes.</span>}
        </p>
      )}

      {format === "tiles" && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {answers.map((a, i) => (
            <div key={i} className="flex gap-1">
              <input
                className="input min-h-11 text-base"
                maxLength={CUSTOM_LIMITS.answerMax}
                placeholder={`Answer ${i + 1}${i < 2 ? "" : " (optional)"}`}
                value={a}
                onChange={(e) => setAnswers((x) => x.map((v, k) => (k === i ? e.target.value : v)))}
              />
              {answers.length > 2 && (
                <button type="button" className="btn-ghost min-h-11 min-w-11 px-1" aria-label={`Remove answer ${i + 1}`} onClick={() => setAnswers((x) => x.filter((_, k) => k !== i))}>
                  <X size={16} />
                </button>
              )}
            </div>
          ))}
          {answers.length < 6 && (
            <button type="button" className="btn-ghost min-h-11 justify-start text-sm" onClick={() => setAnswers((x) => [...x, ""])}>
              <Plus size={16} /> Add answer
            </button>
          )}
        </div>
      )}
      {format === "number" && (
        <div className="grid grid-cols-3 gap-2">
          <label className="flex flex-col gap-1 text-sm">
            Lowest
            <input className="input min-h-11 text-base" type="number" value={min} onChange={(e) => setMin(Math.round(Number(e.target.value)))} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Highest
            <input className="input min-h-11 text-base" type="number" value={max} onChange={(e) => setMax(Math.round(Number(e.target.value)))} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Unit
            <input className="input min-h-11 text-base" maxLength={20} placeholder="hours, €, …" value={unit} onChange={(e) => setUnit(e.target.value)} />
          </label>
        </div>
      )}
      {format === "scale" && (
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-sm">
            1 means…
            <input className="input min-h-11 text-base" maxLength={40} placeholder="not at all" value={minLabel} onChange={(e) => setMinLabel(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            10 means…
            <input className="input min-h-11 text-base" maxLength={40} placeholder="absolutely" value={maxLabel} onChange={(e) => setMaxLabel(e.target.value)} />
          </label>
        </div>
      )}

      <button className="btn-primary min-h-12" disabled={busy || !prompt.trim() || !hasTarget} data-testid="custom-add">
        {submitLabel.startsWith("Save") ? <BookmarkPlus size={18} /> : <Plus size={18} />} {submitLabel}
      </button>
      {footnote && <p className="text-xs text-muted">{footnote}</p>}
    </form>
  );
}
