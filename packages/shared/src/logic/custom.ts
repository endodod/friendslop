import { z } from "zod";
import { QuestionSchema, type ContentBundle, type Question } from "../content/schemas";
import { placeholdersIn, ALLOWED_PLACEHOLDERS } from "../content/lint";
import { fail } from "../engine/errors";
import type { CustomQuestion, RoomState } from "../engine/types";

export const CUSTOM_PACK_ID = "custom";
export const CUSTOM_THEME_ID = "custom";
export const CUSTOM_LIMITS = { perRoom: 80, promptMax: 200, answerMax: 60 };

const text = (max: number) => z.string().trim().min(1).max(max);

/** What the lobby form sends. Turned into a full Question (same schema as shipped content). */
export const CustomQuestionDraftSchema = z.discriminatedUnion("format", [
  z.object({ format: z.literal("tiles"), prompt: text(CUSTOM_LIMITS.promptMax), answers: z.array(text(CUSTOM_LIMITS.answerMax)).min(2).max(6) }),
  z.object({
    format: z.literal("number"),
    prompt: text(CUSTOM_LIMITS.promptMax),
    min: z.number().int().min(-1_000_000).max(1_000_000),
    max: z.number().int().min(-1_000_000).max(1_000_000),
    unit: z.string().trim().max(20).optional(),
  }),
  z.object({ format: z.literal("scale"), prompt: text(CUSTOM_LIMITS.promptMax), minLabel: text(40), maxLabel: text(40) }),
  z.object({ format: z.literal("player"), prompt: text(CUSTOM_LIMITS.promptMax) }),
]);
export type CustomQuestionDraft = z.infer<typeof CustomQuestionDraftSchema>;

/** Validate a draft and build the full question. Throws a GameError with a readable message. */
export function buildCustomQuestion(draft: CustomQuestionDraft, id: string): Question {
  const prompt = draft.prompt.replace(/\s+/g, " ").trim();
  if (!prompt.includes("{target}")) fail("INVALID_INPUT", "Put {target} in the question where the player's name goes.");
  for (const p of placeholdersIn(prompt))
    if (!(ALLOWED_PLACEHOLDERS as readonly string[]).includes(p)) fail("INVALID_INPUT", `Unknown placeholder {${p}}.`);
  const base = { id, themes: [CUSTOM_THEME_ID], prompt, weight: 2 };
  let q: unknown;
  switch (draft.format) {
    case "tiles": {
      const answers = draft.answers.map((a) => a.trim());
      if (new Set(answers.map((a) => a.toLowerCase())).size !== answers.length) fail("INVALID_INPUT", "Answers must be different.");
      q = { ...base, format: "tiles", answers, usage: ["tile", "minigameIntro", "questionOnlyMinigame"] };
      break;
    }
    case "number": {
      if (draft.max - draft.min < 2) fail("INVALID_INPUT", "The range is too small.");
      const span = draft.max - draft.min;
      const tolerance = span > 50 ? { type: "relative", value: 0.2 } : { type: "absolute", value: Math.max(1, Math.round(span / 10)) };
      q = { ...base, format: "number", number: { min: draft.min, max: draft.max, step: 1, unit: draft.unit || undefined, tolerance }, usage: ["tile", "questionOnlyMinigame"] };
      break;
    }
    case "scale":
      q = {
        ...base,
        format: "scale",
        number: { min: 1, max: 10, step: 1, tolerance: { type: "absolute", value: 1 } },
        scaleLabels: { min: draft.minLabel, max: draft.maxLabel },
        usage: ["tile", "minigameIntro", "questionOnlyMinigame"],
      };
      break;
    case "player":
      q = { ...base, format: "player", usage: ["tile", "minigameIntro"] };
      break;
  }
  const parsed = QuestionSchema.safeParse(q);
  if (!parsed.success) fail("INVALID_INPUT", parsed.error.issues[0]?.message ?? "Invalid question.");
  return parsed.data;
}

export function addCustomQuestion(
  room: RoomState,
  author: { id: string; name: string },
  draft: CustomQuestionDraft,
  id: string,
): RoomState {
  if (room.stage !== "lobby") fail("GAME_IN_PROGRESS", "Add questions in the lobby.");
  if ((room.customQuestions ?? []).length >= CUSTOM_LIMITS.perRoom) fail("INVALID_INPUT", "This room has enough custom questions.");
  const question = buildCustomQuestion(draft, id);
  if ((room.customQuestions ?? []).some((c) => String(c.question.prompt).toLowerCase() === String(question.prompt).toLowerCase()))
    fail("INVALID_INPUT", "That question is already in the pack.");
  const entry: CustomQuestion = { id, authorId: author.id, authorName: author.name, question };
  return { ...room, customQuestions: [...(room.customQuestions ?? []), entry] };
}

export function removeCustomQuestion(room: RoomState, actor: { playerId?: string; isHost: boolean }, id: string): RoomState {
  const entry = (room.customQuestions ?? []).find((c) => c.id === id);
  if (!entry) fail("INVALID_INPUT", "Question not found.");
  if (!actor.isHost && entry.authorId !== actor.playerId) fail("NOT_HOST", "Only the author or the host can remove it.");
  return { ...room, customQuestions: room.customQuestions.filter((c) => c.id !== id) };
}

/** Content with this room's custom pack added (when it has questions). */
export function withCustomPack(content: ContentBundle, room: Pick<RoomState, "customQuestions" | "settings">): ContentBundle {
  const qs = room.customQuestions ?? [];
  if (!qs.length) return content;
  return {
    ...content,
    packs: [
      ...content.packs,
      { id: CUSTOM_PACK_ID, name: "Custom", language: room.settings.language, version: 1, defaultEnabled: true, questions: qs.map((c) => c.question) },
    ],
  };
}
