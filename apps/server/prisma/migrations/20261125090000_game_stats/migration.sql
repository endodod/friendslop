-- CreateTable
CREATE TABLE "UserGameStat" (
    "userId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "played" INTEGER NOT NULL DEFAULT 0,
    "won" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "UserGameStat_pkey" PRIMARY KEY ("userId","gameId")
);

-- AddForeignKey
ALTER TABLE "UserGameStat" ADD CONSTRAINT "UserGameStat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Every game so far was the party board game.
INSERT INTO "UserGameStat" ("userId", "gameId", "played", "won")
SELECT "id", 'party', "gamesPlayed", "gamesWon" FROM "User" WHERE "gamesPlayed" > 0;
