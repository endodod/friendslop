import { z } from "zod";
import { LanguageSchema } from "../i18n";
import type { GameEvent } from "../engine/types";
import type { PrivateState, PublicRoomState } from "../engine/projection";

const PlayerIdSchema = z.string().min(1).max(64);
const RoomCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{4}$/);

export const AnswerSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("option"), optionId: z.string().max(32) }),
  z.object({ kind: z.literal("number"), value: z.number().finite() }),
  z.object({ kind: z.literal("player"), playerId: PlayerIdSchema }),
  z.object({ kind: z.literal("order"), optionIds: z.array(z.string().max(32)).min(2).max(6) }),
  z.object({ kind: z.literal("hl"), dir: z.enum(["higher", "lower"]) }),
]);

export const RoomSettingsPatchSchema = z
  .object({
    turnCount: z.number().int(),
    themes: z.array(z.string().max(64)).max(50),
    pacing: z.enum(["low", "normal", "high"]),
    dataQuestions: z.boolean(),
    familyFriendly: z.boolean(),
    language: LanguageSchema,
    boardId: z.string().max(64),
  })
  .partial();

/** Every client → server event with its payload schema. */
export const ClientEvents = {
  "room:create": z.object({
    role: z.enum(["player", "display"]),
    name: z.string().max(40).optional(),
    color: z.string().max(16).optional(),
    profileToken: z.string().max(64).optional(),
  }),
  "room:join": z.object({
    code: RoomCodeSchema,
    role: z.enum(["player", "display"]),
    name: z.string().max(40).optional(),
    color: z.string().max(16).optional(),
    /** Seat token from localStorage for reconnecting. */
    token: z.string().max(128).optional(),
    profileToken: z.string().max(64).optional(),
  }),
  "room:leave": z.object({}),
  "room:settings": RoomSettingsPatchSchema,
  "room:profile": z.object({ name: z.string().max(40).optional(), color: z.string().max(16).optional() }),
  "room:kick": z.object({ playerId: PlayerIdSchema }),
  "player:ready": z.object({ ready: z.boolean() }),
  "game:start": z.object({
    mode: z.enum(["board", "questionDebug", "minigameDebug"]).default("board"),
    minigameId: z.string().max(64).optional(),
  }),
  "game:abort": z.object({}),
  "game:continue": z.object({}),
  /** "Got it!" on a tutorial screen (game start, mini-game intro). */
  "game:ready": z.object({}),
  "game:playAgain": z.object({}),
  "turn:useItem": z.object({ itemId: z.string().max(64), targetId: PlayerIdSchema.optional() }),
  "turn:roll": z.object({ value: z.number().int().min(1).max(6).optional() }),
  "turn:chooseDirection": z.object({ tileId: z.string().max(64) }),
  "shop:buy": z.object({ itemId: z.string().max(64) }),
  "shop:leave": z.object({}),
  "star:buy": z.object({ buy: z.boolean() }),
  "duel:pick": z.object({ opponentId: PlayerIdSchema }),
  "question:answer": z.object({ answer: AnswerSchema }),
  "minigame:input": z.object({ input: z.unknown() }),
  "minigame:submit": z.object({ submission: z.unknown() }),
  "account:linkSteam": z.object({ profile: z.string().min(2).max(200) }),
  "account:unlink": z.object({ provider: z.enum(["steam", "lastfm", "spotify"]) }),
} as const;

export type ClientEventName = keyof typeof ClientEvents;
export type ClientPayload<E extends ClientEventName> = z.input<(typeof ClientEvents)[E]>;

export type Ack<T = {}> = ({ ok: true } & T) | { ok: false; code: string; message: string };

export interface JoinResult {
  code: string;
  role: "player" | "display";
  playerId?: string;
  token: string;
}

export interface ServerToClientEvents {
  "state:public": (state: PublicRoomState) => void;
  "state:private": (state: PrivateState) => void;
  event: (events: GameEvent[]) => void;
  error: (err: { code: string; message: string }) => void;
  kicked: () => void;
}

export type ClientToServerEvents = {
  [E in ClientEventName]: (payload: ClientPayload<E>, ack?: (res: Ack<any>) => void) => void;
};
