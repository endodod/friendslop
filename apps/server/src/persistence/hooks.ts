import type { GameEvent, RoomState } from "@party-game/shared";
import type { RoomRecord } from "../rooms/roomStore";
import { safely } from "./db";

/** DB ids of running matches, by room record. */
const matchIds = new WeakMap<RoomRecord, Promise<string | null>>();

/** Fire-and-forget persistence. The game never waits for (or breaks because of) the database. */
export const persistence = {
  async upsertProfile(token: string, displayName: string): Promise<string | null> {
    const p = await safely("upsertProfile", (db) =>
      db.profile.upsert({ where: { token }, create: { token, displayName }, update: { displayName } }),
    );
    return p?.id ?? null;
  },

  onGameStart(rec: RoomRecord) {
    const room = rec.room;
    matchIds.set(
      rec,
      safely("createMatch", (db) =>
        db.match.create({
          data: { roomCode: room.code, startedAt: new Date(), settings: room.settings as object },
        }),
      ).then((m) => m?.id ?? null),
    );
  },

  afterStep(rec: RoomRecord, _before: RoomState, events: GameEvent[]) {
    const g = rec.room.game;
    if (!g) return;
    if (events.some((e) => e.type === "matchRevealed") && g.question?.result) {
      const q = g.question;
      const r = q.result!;
      void safely("questionStat", async (db) => {
        const prev = await db.questionStat.findUnique({ where: { questionId: q.question.id } });
        const guesses = (prev?.guesses ?? 0) + r.guesserCount;
        const timesMatched = (prev?.timesMatched ?? 0) + r.matchedCount;
        await db.questionStat.upsert({
          where: { questionId: q.question.id },
          create: { questionId: q.question.id, timesAsked: 1, guesses, timesMatched, matchRate: guesses ? timesMatched / guesses : 0 },
          update: { timesAsked: { increment: 1 }, guesses, timesMatched, matchRate: guesses ? timesMatched / guesses : 0 },
        });
      });
    }
    if (events.some((e) => e.type === "phase" && e.phase === "podium")) {
      const matchPromise = matchIds.get(rec);
      const profiles = new Map<string, string>();
      for (const seat of rec.seats.values()) if (seat.playerId && seat.profileId) profiles.set(seat.playerId, seat.profileId);
      const winner = g.finalRanking?.[0];
      void matchPromise?.then((matchId) =>
        safely("finishMatch", async (db) => {
          if (!matchId) return;
          await db.match.update({
            where: { id: matchId },
            data: { endedAt: new Date(), winnerProfileId: (winner && profiles.get(winner)) || null },
          });
          for (const p of Object.values(g.players)) {
            const profileId = profiles.get(p.id);
            if (!profileId) continue;
            await db.matchPlayer.create({
              data: { matchId, profileId, stars: p.stars, coins: p.coins, stats: p.stats as object },
            });
          }
        }),
      );
    }
  },
};
