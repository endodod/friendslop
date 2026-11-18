import { avatarPath, type FriendEntry, type FriendStatus } from "@party-game/shared";
import type { PrismaClient } from "../generated/prisma/client";
import { emitToUser, isOnline, roomOf } from "./presence";

const userBits = { select: { id: true, username: true, avatarVersion: true, avatarMime: true } } as const;

/** The friendship row between two users, whichever direction it was requested in. */
export function findPair(db: PrismaClient, a: string, b: string) {
  return db.friendship.findFirst({
    where: {
      OR: [
        { requesterId: a, addresseeId: b },
        { requesterId: b, addresseeId: a },
      ],
    },
  });
}

export async function friendStatus(db: PrismaClient, me: string, other: string): Promise<FriendStatus> {
  if (me === other) return "self";
  const row = await findPair(db, me, other);
  if (!row) return "none";
  if (row.status === "accepted") return "friends";
  return row.requesterId === me ? "outgoing" : "incoming";
}

export async function areFriends(db: PrismaClient, a: string, b: string): Promise<boolean> {
  return (await friendStatus(db, a, b)) === "friends";
}

export async function listFriends(db: PrismaClient, me: string): Promise<FriendEntry[]> {
  const rows = await db.friendship.findMany({
    where: { OR: [{ requesterId: me }, { addresseeId: me }] },
    include: { requester: userBits, addressee: userBits },
  });
  const out: FriendEntry[] = rows.map((r) => {
    const mine = r.requesterId === me;
    const u = mine ? r.addressee : r.requester;
    const status: FriendEntry["status"] = r.status === "accepted" ? "friends" : mine ? "outgoing" : "incoming";
    const online = status === "friends" && isOnline(u.id);
    return {
      user: { id: u.id, username: u.username, photo: u.avatarMime ? avatarPath(u.id, u.avatarVersion) : null },
      status,
      online,
      inRoom: online ? roomOf(u.id) : null,
    };
  });
  const order = { incoming: 0, friends: 1, outgoing: 2 };
  return out.sort(
    (a, b) =>
      order[a.status] - order[b.status] ||
      Number(b.online) - Number(a.online) ||
      a.user.username.localeCompare(b.user.username),
  );
}

/** Send a request (or accept theirs if they already asked). Returns the resulting status. */
export async function requestFriend(db: PrismaClient, me: string, other: string): Promise<FriendStatus> {
  const row = await findPair(db, me, other);
  if (row) {
    if (row.status === "pending" && row.addresseeId === me) {
      await db.friendship.update({ where: { id: row.id }, data: { status: "accepted" } });
      emitToUser(other, "friends:changed");
      return "friends";
    }
    return row.status === "accepted" ? "friends" : "outgoing";
  }
  await db.friendship.create({ data: { requesterId: me, addresseeId: other } });
  emitToUser(other, "friends:changed");
  return "outgoing";
}

export async function acceptFriend(db: PrismaClient, me: string, other: string): Promise<boolean> {
  const res = await db.friendship.updateMany({
    where: { requesterId: other, addresseeId: me, status: "pending" },
    data: { status: "accepted" },
  });
  if (res.count) emitToUser(other, "friends:changed");
  return res.count > 0;
}

/** Remove a friend, decline an incoming request or cancel an outgoing one. */
export async function removeFriend(db: PrismaClient, me: string, other: string) {
  await db.friendship.deleteMany({
    where: {
      OR: [
        { requesterId: me, addresseeId: other },
        { requesterId: other, addresseeId: me },
      ],
    },
  });
  emitToUser(other, "friends:changed");
}
