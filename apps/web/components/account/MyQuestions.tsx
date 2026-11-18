"use client";
import { Pencil, Plus, Trash2, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { SAVED_QUESTIONS_MAX, type CustomQuestionDraft } from "@party-game/shared";
import { deleteSavedQuestion, loadSavedQuestions, promptKey, saveQuestions, useAccount } from "@/lib/account";
import { FORMATS, PromptPreview, QuestionEditor, loadSaved } from "../lobby/CustomQuestions";

/** Profile: custom questions saved on the account, loadable into any lobby. */
export function MyQuestions() {
  const questions = useAccount((s) => s.questions);
  const [open, setOpen] = useState(false);
  const [device, setDevice] = useState<CustomQuestionDraft[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadSavedQuestions();
    setDevice(loadSaved());
  }, []);

  const have = new Set((questions ?? []).map((q) => promptKey(q.draft.prompt)));
  const onlyOnDevice = device.filter((d) => !have.has(promptKey(d.prompt)));

  return (
    <section className="card flex flex-col gap-3 p-5" data-testid="my-questions">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-2xl">
          <Pencil size={20} /> My questions <span className="text-base text-muted">{questions?.length ?? 0}</span>
        </h2>
        {!open && (
          <button className="btn-primary min-h-11 text-base" onClick={() => setOpen(true)}>
            <Plus size={18} /> Write one
          </button>
        )}
      </div>
      <p className="text-sm text-muted">Saved custom questions. Load them into any lobby with one tap.</p>

      {open && (
        <QuestionEditor
          onClose={() => setOpen(false)}
          submitLabel="Save to profile"
          onSubmit={async (d) => {
            const err = await saveQuestions([d]);
            setError(err);
            return !err;
          }}
        />
      )}
      {error && (
        <p className="text-sm font-semibold text-bad" role="alert">
          {error}
        </p>
      )}

      {onlyOnDevice.length > 0 && (
        <button
          className="btn-secondary min-h-11 self-start text-sm"
          onClick={async () => setError(await saveQuestions(onlyOnDevice.slice(0, SAVED_QUESTIONS_MAX)))}
        >
          <Upload size={16} /> Import {onlyOnDevice.length} question{onlyOnDevice.length > 1 ? "s" : ""} saved on this device
        </button>
      )}

      {questions && questions.length > 0 && (
        <ul className="flex flex-col gap-2">
          {questions.map((q) => (
            <li key={q.id} className="flex items-start gap-3 rounded-2xl bg-bg-2 p-3">
              <div className="min-w-0 flex-1">
                <p className="leading-snug">
                  <PromptPreview text={q.draft.prompt} name="[player]" />
                </p>
                <p className="text-xs text-muted">
                  {FORMATS.find((f) => f.id === q.draft.format)?.label}
                  {q.draft.format === "tiles" && ` · ${q.draft.answers.join(" / ")}`}
                </p>
              </div>
              <button className="btn-ghost min-h-11 min-w-11 px-2" aria-label="Delete question" onClick={() => deleteSavedQuestion(q.id)}>
                <Trash2 size={18} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
