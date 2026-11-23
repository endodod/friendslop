import type { Server, Socket } from "socket.io";
import {
  ClientEvents,
  GAME_CONFIG,
  fail,
  type Ack,
  type ClientEventName,
  type ServerToClientEvents,
} from "@party-game/shared";
import type { z } from "zod";
import type { RoomManager, SocketData } from "./rooms/manager";
import { persistence } from "./persistence/hooks";
import { linkSteam, unlinkProvider } from "./providers/linking";
import { userFromToken } from "./accounts/auth";
import { areFriends } from "./accounts/friends";
import { emitToUser, isOnline, notifyFriends, setSocketUser, userOfSocket } from "./accounts/presence";
import { db } from "./persistence/db";
import { avatarPath } from "@party-game/shared";

type IoSocket = Socket<any, ServerToClientEvents, any, SocketData>;

/** Simple token bucket per socket. */
function rateLimiter() {
  let tokens: number = GAME_CONFIG.rateLimit.eventsPerSecond;
  let last = Date.now();
  return () => {
    const now = Date.now();
    tokens = Math.min(GAME_CONFIG.rateLimit.eventsPerSecond, tokens + ((now - last) / 1000) * GAME_CONFIG.rateLimit.eventsPerSecond);
    last = now;
    if (tokens < 1) return false;
    tokens -= 1;
    return true;
  };
}

export function registerSocketHandlers(io: Server<any, ServerToClientEvents, any, SocketData>, rooms: RoomManager) {
  io.on("connection", (socket: IoSocket) => {
    const allow = rateLimiter();

    /** Validate payload with zod, rate-limit, map errors to acks. */
    function on<E extends ClientEventName>(
      event: E,
      handler: (payload: z.output<(typeof ClientEvents)[E]>) => unknown | Promise<unknown>,
    ) {
      (socket as Socket).on(event as string, async (raw: unknown, ack?: (r: Ack<any>) => void) => {
        const reply = typeof ack === "function" ? ack : () => {};
        try {
          if (!allow()) fail("RATE_LIMITED", "Slow down!");
          const parsed = ClientEvents[event].safeParse(raw ?? {});
          if (!parsed.success) fail("INVALID_INPUT", `Invalid ${event} payload.`);
          const result = await handler(parsed.data as never);
          reply({ ok: true, ...(result && typeof result === "object" ? result : {}) });
        } catch (e) {
          const err = rooms.errorOf(e);
          reply({ ok: false, ...err });
          socket.emit("error", err);
        }
      });
    }

    const current = () => {
      if (!socket.data.code) fail("ROOM_NOT_FOUND", "You're not in a room.");
      return rooms.get(socket.data.code);
    };
    const me = () => {
      const pid = socket.data.playerId;
      if (!pid) fail("UNKNOWN_PLAYER", "Only players can do that.");
      return pid;
    };

    /** The signed-in account of this socket, as shown in rooms. */
    let identifying: Promise<unknown> = Promise.resolve();
    async function account() {
      await identifying;
      const userId = userOfSocket(socket.id);
      const c = db();
      if (!userId || !c) return null;
      const u = await c.user.findUnique({ where: { id: userId }, select: { id: true, username: true, avatarVersion: true, avatarMime: true } });
      return u ? { userId: u.id, username: u.username, photo: u.avatarMime ? avatarPath(u.id, u.avatarVersion) : null } : null;
    }
    const withPhotoChoice = <T extends { photo: string | null } | null>(acc: T, usePhoto: boolean | undefined): T =>
      acc && usePhoto === false ? { ...acc, photo: null } : acc;
    const roomChanged = () => {
      const userId = userOfSocket(socket.id);
      if (userId) void notifyFriends(userId);
    };

    async function profileFor(token: string | undefined, name: string | undefined) {
      if (!token || !name) return null;
      return persistence.upsertProfile(token, name);
    }

    on("room:create", async (p) => {
      if (p.role === "player" && !p.name?.trim()) fail("NAME_INVALID", "Please enter a name.");
      const rec = rooms.createRoom();
      const profileId = await profileFor(p.profileToken, p.name);
      const seat = rooms.join(socket, rec, {
        role: p.role,
        name: p.name,
        color: p.color,
        avatar: p.avatar,
        profileId,
        account: p.role === "player" ? withPhotoChoice(await account(), p.usePhoto) : null,
      });
      rooms.resend(rec, socket);
      roomChanged();
      return { code: rec.room.code, role: seat.role, playerId: seat.playerId ?? undefined, token: seat.token };
    });

    on("room:join", async (p) => {
      const rec = rooms.get(p.code);
      const profileId = p.token ? null : await profileFor(p.profileToken, p.name);
      const seat = rooms.join(socket, rec, {
        role: p.role,
        name: p.name,
        color: p.color,
        avatar: p.avatar,
        token: p.token,
        profileId,
        account: p.role === "player" && !p.token ? withPhotoChoice(await account(), p.usePhoto) : null,
      });
      rooms.resend(rec, socket);
      roomChanged();
      return { code: rec.room.code, role: seat.role, playerId: seat.playerId ?? undefined, token: seat.token };
    });

    on("room:leave", () => {
      rooms.leave(socket);
      roomChanged();
    });

    on("auth:identify", async (p) => {
      // room:join may arrive right behind this; account() waits for it.
      const work = (async () => {
        const user = p.token ? await userFromToken(p.token).catch(() => null) : null;
        setSocketUser(socket, user?.id ?? null);
        return user?.id ?? null;
      })();
      identifying = work;
      return { userId: await work };
    });
    on("friend:invite", async (p) => {
      const rec = current();
      const pid = me();
      const from = userOfSocket(socket.id);
      const c = db();
      if (!from || !c) fail("UNAUTHORIZED", "Sign in to invite friends.");
      if (!(await areFriends(c, from, p.userId))) fail("NOT_FRIENDS", "You can only invite friends.");
      rooms.canInvite(rec);
      const player = rec.room.players.find((x) => x.id === pid);
      if (rec.room.players.some((x) => x.userId === p.userId)) fail("INVALID_INPUT", "They're already here.");
      if (!isOnline(p.userId)) fail("INVALID_INPUT", "That friend is offline.");
      emitToUser(p.userId, "invite", {
        code: rec.room.code,
        from: { userId: from, username: player?.username ?? player?.name ?? "A friend", photo: player?.photo ?? null },
        at: Date.now(),
      });
    });
    on("room:settings", (p) => rooms.setSettings(current(), socket.data, p));
    on("room:profile", async (p) => {
      const rec = current();
      const pid = me();
      const { usePhoto, ...patch } = p;
      if (usePhoto === undefined) return rooms.setProfile(rec, pid, patch);
      const acc = await account();
      const player = rec.room.players.find((x) => x.id === pid);
      // Only your own account's picture, and only for the account that joined this seat.
      const photo = usePhoto && acc && player?.userId === acc.userId ? acc.photo : null;
      rooms.setProfile(rec, pid, { ...patch, photo });
    });
    on("room:kick", (p) => rooms.kick(current(), socket.data, p.playerId));
    on("room:addBot", () => rooms.addBot(current(), socket.data));
    on("player:ready", (p) => rooms.setReady(current(), me(), p.ready));
    on("game:start", (p) => rooms.start(current(), socket.data, p.mode, p.minigameId));
    on("game:abort", () => rooms.abort(current(), socket.data));
    on("game:pause", (p) => rooms.pause(current(), socket.data, p.paused));
    on("game:playAgain", () => rooms.playAgain(current(), socket.data));
    on("game:continue", () => rooms.action(current(), socket.data, { type: "continue" }));
    on("game:finish", () => rooms.action(current(), socket.data, { type: "finish" }));
    on("chat:send", (p) => rooms.chat(current(), me(), p.text));
    on("game:ready", () => rooms.action(current(), socket.data, { type: "ready", playerId: me() }));

    on("turn:roll", (p) => rooms.action(current(), socket.data, { type: "roll", playerId: me(), value: p.value }));
    on("turn:useItem", (p) =>
      rooms.action(current(), socket.data, { type: "useItem", playerId: me(), itemId: p.itemId, targetId: p.targetId }),
    );
    on("turn:chooseDirection", (p) =>
      rooms.action(current(), socket.data, { type: "chooseDirection", playerId: me(), tileId: p.tileId }),
    );
    on("shop:buy", (p) => rooms.action(current(), socket.data, { type: "shopBuy", playerId: me(), itemId: p.itemId }));
    on("shop:leave", () => rooms.action(current(), socket.data, { type: "shopLeave", playerId: me() }));
    on("star:buy", (p) => rooms.action(current(), socket.data, { type: "starBuy", playerId: me(), buy: p.buy }));
    on("tile:choose", (p) => rooms.action(current(), socket.data, { type: "tileChoice", playerId: me(), accept: p.accept }));
    on("duel:pick", (p) => rooms.action(current(), socket.data, { type: "duelPick", playerId: me(), opponentId: p.opponentId }));
    on("question:answer", (p) => rooms.action(current(), socket.data, { type: "answer", playerId: me(), answer: p.answer }));
    on("question:draft", (p) => rooms.action(current(), socket.data, { type: "draft", playerId: me(), answer: p.answer }));
    on("minigame:input", (p) =>
      rooms.action(current(), socket.data, { type: "minigameInput", playerId: me(), input: p.input }),
    );
    on("minigame:submit", (p) =>
      rooms.action(current(), socket.data, { type: "minigameSubmit", playerId: me(), submission: p.submission }),
    );

    on("custom:add", (p) => rooms.addCustom(current(), me(), p.question));
    on("custom:remove", (p) => rooms.removeCustom(current(), socket.data, p.id));

    on("account:linkSteam", async (p) => {
      const rec = current();
      const pid = me();
      const seat = [...rec.seats.values()].find((s) => s.playerId === pid);
      await linkSteam(rooms, rec, pid, seat?.profileId ?? null, p.profile);
    });
    on("account:unlink", async (p) => {
      const rec = current();
      const pid = me();
      const seat = [...rec.seats.values()].find((s) => s.playerId === pid);
      await unlinkProvider(rooms, rec, pid, seat?.profileId ?? null, p.provider);
    });

    socket.on("disconnect", () => {
      rooms.disconnect(socket);
      setSocketUser(socket, null);
    });
  });
}
