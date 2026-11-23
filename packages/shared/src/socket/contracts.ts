import { z } from "zod";
import { LanguageSchema } from "../i18n";
import { CustomQuestionDraftSchema } from "../logic/custom";
import type { GameEvent } from "../engine/types";
import type { PrivateState, PublicRoomState } from "../engine/projection";

export const CHAT_MAX_LENGTH = 200;

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
    tileFrequency: z.record(z.string().max(64), z.enum(["off", "few", "normal", "many"])),
    minigameMix: z.record(z.string().max(64), z.enum(["off", "few", "normal", "many"])),
    packs: z.array(z.string().max(64)).max(100),
    starGoal: z.number().int().min(0).max(10),
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
    avatar: z.string().max(16).nullable().optional(),
    profileToken: z.string().max(64).optional(),
    /** Signed in with a profile picture: show it (default) or use the chosen icon instead. */
    usePhoto: z.boolean().optional(),
  }),
  "room:join": z.object({
    code: RoomCodeSchema,
    role: z.enum(["player", "display"]),
    name: z.string().max(40).optional(),
    color: z.string().max(16).optional(),
    avatar: z.string().max(16).nullable().optional(),
    /** Seat token from localStorage for reconnecting. */
    token: z.string().max(128).optional(),
    profileToken: z.string().max(64).optional(),
    /** Signed in with a profile picture: show it (default) or use the chosen icon instead. */
    usePhoto: z.boolean().optional(),
  }),
  "room:leave": z.object({}),
  "room:settings": RoomSettingsPatchSchema,
  "room:profile": z.object({
    name: z.string().max(40).optional(),
    color: z.string().max(16).optional(),
    avatar: z.string().max(16).nullable().optional(),
    /** Switch between your profile picture and your icon (signed-in players). */
    usePhoto: z.boolean().optional(),
  }),
  "room:kick": z.object({ playerId: PlayerIdSchema }),
  "player:ready": z.object({ ready: z.boolean() }),
  "game:start": z.object({
    mode: z.enum(["board", "questionDebug", "minigameDebug"]).default("board"),
    minigameId: z.string().max(64).optional(),
  }),
  "game:abort": z.object({}),
  /** Host only: freeze or unfreeze every timer in the game. */
  "game:pause": z.object({ paused: z.boolean() }),
  "game:continue": z.object({}),
  "game:finish": z.object({}),
  /** "Got it!" on a tutorial screen (game start, mini-game intro). */
  "game:ready": z.object({}),
  "game:playAgain": z.object({}),
  "turn:useItem": z.object({ itemId: z.string().max(64), targetId: PlayerIdSchema.optional() }),
  "turn:roll": z.object({ value: z.number().int().min(1).max(6).optional() }),
  "turn:chooseDirection": z.object({ tileId: z.string().max(64) }),
  "shop:buy": z.object({ itemId: z.string().max(64) }),
  "shop:leave": z.object({}),
  "star:buy": z.object({ buy: z.boolean() }),
  "tile:choose": z.object({ accept: z.boolean() }),
  "duel:pick": z.object({ opponentId: PlayerIdSchema }),
  "question:answer": z.object({ answer: AnswerSchema }),
  /** Current (not locked in) selection. Counts if the timer runs out. */
  "question:draft": z.object({ answer: AnswerSchema }),
  "minigame:input": z.object({ input: z.unknown() }),
  "minigame:submit": z.object({ submission: z.unknown() }),
  /** Room chat (players only). */
  "chat:send": z.object({ text: z.string().min(1).max(CHAT_MAX_LENGTH) }),
  "custom:add": z.object({ question: CustomQuestionDraftSchema }),
  "custom:remove": z.object({ id: z.string().max(64) }),
  /** Tell the server which signed-in account this socket belongs to (null = signed out). */
  "auth:identify": z.object({ token: z.string().max(128).nullable() }),
  /** Invite a friend (by user id) to the room you're in. */
  "friend:invite": z.object({ userId: z.string().min(1).max(64) }),
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

/** How many recent messages a room keeps (sent to people who join later). */
export const CHAT_HISTORY = 60;

export interface ChatMessage {
  id: string;
  playerId: string;
  text: string;
  at: number;
}

/** Trim, collapse whitespace, drop control characters. Empty result = nothing to send. */
export function sanitizeChat(text: string): string {
  return text.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, CHAT_MAX_LENGTH);
}

export interface ServerToClientEvents {
  "state:public": (state: PublicRoomState) => void;
  "state:private": (state: PrivateState) => void;
  event: (events: GameEvent[]) => void;
  error: (err: { code: string; message: string }) => void;
  kicked: () => void;
  "chat:message": (m: ChatMessage) => void;
  /** Recent messages, sent after (re)joining. */
  "chat:history": (ms: ChatMessage[]) => void;
  /** A friend invited you to their room. */
  invite: (inv: RoomInvite) => void;
  /** Your friend list changed (request received/accepted/removed, or a friend came online). */
  "friends:changed": () => void;
}

export interface RoomInvite {
  code: string;
  from: { userId: string; username: string; photo: string | null };
  at: number;
}

export type ClientToServerEvents = {
  [E in ClientEventName]: (payload: ClientPayload<E>, ack?: (res: Ack<any>) => void) => void;
};
