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

    async function profileFor(token: string | undefined, name: string | undefined) {
      if (!token || !name) return null;
      return persistence.upsertProfile(token, name);
    }

    on("room:create", async (p) => {
      if (p.role === "player" && !p.name?.trim()) fail("NAME_INVALID", "Please enter a name.");
      const rec = rooms.createRoom();
      const profileId = await profileFor(p.profileToken, p.name);
      const seat = rooms.join(socket, rec, { role: p.role, name: p.name, color: p.color, avatar: p.avatar, profileId });
      rooms.resend(rec, socket);
      return { code: rec.room.code, role: seat.role, playerId: seat.playerId ?? undefined, token: seat.token };
    });

    on("room:join", async (p) => {
      const rec = rooms.get(p.code);
      const profileId = p.token ? null : await profileFor(p.profileToken, p.name);
      const seat = rooms.join(socket, rec, { role: p.role, name: p.name, color: p.color, avatar: p.avatar, token: p.token, profileId });
      rooms.resend(rec, socket);
      return { code: rec.room.code, role: seat.role, playerId: seat.playerId ?? undefined, token: seat.token };
    });

    on("room:leave", () => rooms.leave(socket));
    on("room:settings", (p) => rooms.setSettings(current(), socket.data, p));
    on("room:profile", (p) => rooms.setProfile(current(), me(), p));
    on("room:kick", (p) => rooms.kick(current(), socket.data, p.playerId));
    on("player:ready", (p) => rooms.setReady(current(), me(), p.ready));
    on("game:start", (p) => rooms.start(current(), socket.data, p.mode, p.minigameId));
    on("game:abort", () => rooms.abort(current(), socket.data));
    on("game:pause", (p) => rooms.pause(current(), socket.data, p.paused));
    on("game:playAgain", () => rooms.playAgain(current(), socket.data));
    on("game:continue", () => rooms.action(current(), socket.data, { type: "continue" }));
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

    socket.on("disconnect", () => rooms.disconnect(socket));
  });
}
