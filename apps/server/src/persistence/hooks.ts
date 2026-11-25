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
    if (rec.room.hub) return hubFinished(rec, events);
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
      if (g.mode === "board") {
        // Account stats: everyone signed in who is still in the room when the game ends.
        for (const rp of rec.room.players) {
          const gp = g.players[rp.id];
          if (!rp.userId || !gp) continue;
          const userId = rp.userId;
          void safely("userStats", (db) =>
            db.user.update({
              where: { id: userId },
              data: {
                gamesPlayed: { increment: 1 },
                gamesWon: { increment: rp.id === winner ? 1 : 0 },
                starsCollected: { increment: gp.stars },
              },
            }),
          );
          void countGame(userId, "party", rp.id === winner);
        }
      }
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

function countGame(userId: string, gameId: string, won: boolean) {
  return safely("userGameStat", (db) =>
    db.userGameStat.upsert({
      where: { userId_gameId: { userId, gameId } },
      create: { userId, gameId, played: 1, won: won ? 1 : 0 },
      update: { played: { increment: 1 }, won: { increment: won ? 1 : 0 } },
    }),
  );
}

/** A hub game reached its podium: account stats and match history. */
function hubFinished(rec: RoomRecord, events: GameEvent[]) {
  const rt = rec.room.hub;
  if (!rt?.results || !events.some((e) => e.type === "hubPhase" && e.phase === "podium")) return;
  const results = rt.results;
  const winners = new Set(results.winners);
  for (const rp of rec.room.players) {
    if (!rp.userId || !rt.players.includes(rp.id)) continue;
    const userId = rp.userId;
    const won = winners.has(rp.id);
    void safely("userStats", (db) =>
      db.user.update({ where: { id: userId }, data: { gamesPlayed: { increment: 1 }, gamesWon: { increment: won ? 1 : 0 } } }),
    );
    void countGame(userId, rt.gameId, won);
  }
  const profiles = new Map<string, string>();
  for (const seat of rec.seats.values()) if (seat.playerId && seat.profileId) profiles.set(seat.playerId, seat.profileId);
  void matchIds.get(rec)?.then((matchId) =>
    safely("finishMatch", async (db) => {
      if (!matchId) return;
      const winner = results.winners.find((p) => profiles.has(p));
      await db.match.update({ where: { id: matchId }, data: { endedAt: new Date(), winnerProfileId: (winner && profiles.get(winner)) || null } });
      for (const r of results.ranking) {
        const profileId = profiles.get(r.playerId);
        if (!profileId) continue;
        await db.matchPlayer.create({
          data: { matchId, profileId, stars: 0, coins: r.score, stats: { gameId: rt.gameId, rank: r.rank, lines: results.stats[r.playerId] ?? [] } as object },
        });
      }
    }),
  );
}
