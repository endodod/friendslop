import type { Socket } from "socket.io";
import type { RoomInvite } from "@party-game/shared";
import { db } from "../persistence/db";

/**
 * Who is online: the signed-in user per socket. Kept apart from socket.data because the room
 * manager replaces socket.data on join/leave.
 */
const socketUser = new Map<string, string>();
const userSockets = new Map<string, Set<Socket>>();

export function userOfSocket(socketId: string): string | null {
  return socketUser.get(socketId) ?? null;
}

export function isOnline(userId: string): boolean {
  return (userSockets.get(userId)?.size ?? 0) > 0;
}

/** Room code a user currently plays in (any of their sockets), else null. */
export function roomOf(userId: string): string | null {
  for (const s of userSockets.get(userId) ?? []) if (s.data?.code && s.data.playerId) return s.data.code as string;
  return null;
}

/** Bind (or unbind with null) a socket to a user. Notifies friends when the user comes online/goes offline. */
export function setSocketUser(socket: Socket, userId: string | null) {
  const prev = socketUser.get(socket.id) ?? null;
  if (prev === userId) return;
  if (prev) {
    const set = userSockets.get(prev);
    set?.delete(socket);
    socketUser.delete(socket.id);
    if (!set || set.size === 0) {
      userSockets.delete(prev);
      void notifyFriends(prev);
    }
  }
  if (userId) {
    socketUser.set(socket.id, userId);
    let set = userSockets.get(userId);
    if (!set) userSockets.set(userId, (set = new Set()));
    const cameOnline = set.size === 0;
    set.add(socket);
    if (cameOnline) void notifyFriends(userId);
  }
}

export function emitToUser(userId: string, event: "friends:changed"): void;
export function emitToUser(userId: string, event: "invite", payload: RoomInvite): void;
export function emitToUser(userId: string, event: string, payload?: unknown) {
  for (const s of userSockets.get(userId) ?? []) s.emit(event, payload);
}

/** Tell a user's friends to refresh their list (online status / room changed). */
export async function notifyFriends(userId: string) {
  const c = db();
  if (!c) return;
  try {
    const rows = await c.friendship.findMany({
      where: { status: "accepted", OR: [{ requesterId: userId }, { addresseeId: userId }] },
      select: { requesterId: true, addresseeId: true },
    });
    for (const r of rows) emitToUser(r.requesterId === userId ? r.addresseeId : r.requesterId, "friends:changed");
  } catch {
    /* presence is best effort */
  }
}
