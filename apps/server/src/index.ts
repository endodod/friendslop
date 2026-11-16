import { createServer } from "node:http";
import { Server } from "socket.io";
import { BRANDING, DATA_GENERATORS, GAME_CONFIG } from "@party-game/shared";
import { loadContent } from "@party-game/content/node";
import { MINIGAMES } from "@party-game/minigames/server";
import { env } from "./config";
import { initDb } from "./persistence/db";
import { RoomManager } from "./rooms/manager";
import { registerSocketHandlers } from "./socket";

async function main() {
  const content = loadContent(); // throws with a list of problems if content is invalid
  console.log(
    `[content] ${content.packs.length} packs, ${content.packs.reduce((n, p) => n + p.questions.length, 0)} questions, ` +
      `${content.themes.length} themes, ${content.boards.length} boards, ${Object.keys(MINIGAMES).length} mini-games`,
  );
  await initDb();

  const http = createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, name: BRANDING.name }));
      return;
    }
    const board = req.url?.match(/^\/content\/boards\/([a-z0-9._-]+)$/);
    if (board) {
      const b = content.boards.find((x) => x.id === board[1]);
      res.writeHead(b ? 200 : 404, {
        "content-type": "application/json",
        "access-control-allow-origin": "*",
        "cache-control": "public, max-age=300",
      });
      res.end(b ? JSON.stringify(b) : "{}");
      return;
    }
    res.writeHead(404);
    res.end();
  });

  const io = new Server(http, {
    cors: { origin: env.webOrigins.length ? env.webOrigins : true, credentials: true },
    pingInterval: 10000,
    pingTimeout: 8000,
  });

  const rooms = new RoomManager(io, content, MINIGAMES, DATA_GENERATORS);
  registerSocketHandlers(io, rooms);
  setInterval(() => rooms.tick(), Math.round(1000 / GAME_CONFIG.minigame.tickHz));

  http.listen(env.port, env.host, () => console.log(`[server] ${BRANDING.name} game server on :${env.port}`));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
