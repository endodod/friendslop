# PartyGame

A browser-based party board game for 2–8 friends. Every question is about one player (the
**target**): everyone answers, the target included, and you score by landing on the same answer
as the target. Questions pop up on board tiles and before mini-games, where matching the target
earns a bonus.

> Working title. Rename it in one place: `packages/shared/src/config/branding.ts`.

## How to play

- **Same room:** open the game on a TV/laptop and choose *Create on a shared screen*. Everyone
  scans the QR code with their phone. Phones become controllers; the board lives on the TV.
- **Online (e.g. on a Discord call):** one person chooses *Create room & play* and shares the
  link or the 4-letter code. Everyone sees the board and their controls on their own device.

Each round every player rolls and moves; tiles give coins, start question rounds, events, shops
or duels. Buy stars for 20 coins when you reach (or pass) the star. After every round there's a
mini-game. Most stars after the last round wins (coins break ties), after 2–3 bonus stars.

Refreshing or losing connection is fine: you get your seat back automatically. If you're gone
on your turn, it auto-plays after a few seconds.

## Accounts (optional)

Players can play as guests, or sign in (username + password) for:

- a **profile** (`/profile`) with a custom **profile picture** (shown instead of the icon in rooms and on the board)
  and **stats**: games played, games won, stars collected (updated when a board game reaches the podium)
- **friends**: add by username (or from the lobby), accept/decline requests, see who's online and in which room;
  public profiles at `/u/<username>`
- **invites**: in the lobby, invite online friends from your friend list; they get a pop-up with a Join button on any page
- **saved custom questions**: questions you write are kept on your profile and can be loaded into any lobby in one tap

Accounts need `DATABASE_URL`; without it everything else still works and the account pages say they're unavailable.
The API lives on the game server under `/api/*` (bearer token in localStorage, no cookies, since web and server are on
different domains). Passwords are hashed with scrypt; only a SHA-256 of each session token is stored. Profile pictures
are center-cropped to 256×256 in the browser and stored in Postgres.

## Run it

Requirements: Node 22+, pnpm 10. Postgres 16 is optional (or use Docker).

```bash
pnpm install
cp .env.example .env
pnpm --filter @party-game/server exec prisma generate
pnpm --filter @party-game/server exec prisma migrate deploy   # only with Postgres
pnpm dev                                                      # server :4000, web :3000
```

Open http://localhost:3000. Phones on the same Wi-Fi: `http://<your-computer-ip>:3000` (the web
app talks to the game server on the same host, port 4000, unless `NEXT_PUBLIC_SERVER_URL` is set).

Without `DATABASE_URL` (or with Postgres down) the game runs normally; it just doesn't store
match history or question stats, and accounts are unavailable.

### Docker

```bash
docker compose up --build
```

Starts Postgres, the game server (runs migrations on start) and the web app.

## Free hosting

The web app and the game server are deployed separately: the server keeps live games in memory
and holds a WebSocket per player, which serverless platforms (like Vercel) can't do.

**1. Game server → Render (free)**

1. On [render.com](https://render.com): **New → Blueprint**, pick this repo. `render.yaml` sets up
   a free Node web service (build, start command, health check).
2. Note the service URL, e.g. `https://friendslop-server.onrender.com`.

The free plan sleeps after ~15 minutes without traffic. The web app pings it as soon as someone
opens the page and shows "Waking up the game server…" until it's up (usually 30–60 s). It never
sleeps during a game. Rooms are lost on a restart/redeploy.

**2. Web app → Vercel (free)**

1. Import the repo on [vercel.com](https://vercel.com) and set **Root Directory** to `apps/web`
   (leave "Include files outside the root directory" on). Framework: Next.js, no other build settings.
2. Add the environment variable `NEXT_PUBLIC_SERVER_URL` = your Render URL, then deploy (it's baked in at build time, so redeploy after changing it).

**3. Connect them**

On Render, set `WEB_ORIGINS` to your Vercel URL (e.g. `https://friendslop.vercel.app`, comma-separate several).

**Optional database:** set `DATABASE_URL` on Render to a free Postgres (e.g. [Neon](https://neon.tech)) and run
`pnpm --filter @party-game/server exec prisma migrate deploy` once against it. Without it the game works the same, just without accounts, match history or question stats.

## Tests

```bash
pnpm test           # Vitest: rules, scoring, movement, state machine, mini-games, content lint
pnpm lint:content   # content checks only
pnpm typecheck
pnpm e2e            # Playwright smoke test (starts server + web if they aren't running)
```

## Project structure

```
apps/
  web/            Next.js client: screens, SVG board, question format UIs, mini-game host
  server/         Socket.IO game server: room store, 15 Hz tick, persistence (Prisma)
packages/
  shared/         Types, zod schemas, pure game engine (state machine, rules, scoring),
                  socket contracts, all tunable numbers (src/config/game.ts)
  content/        themes, tiles, items, events, bonus stars, mini-game metadata,
                  boards/, packs/ (question packs)
  minigames/      one folder per mini-game: logic.ts (server) + Client.tsx (UI)
tests/e2e/        Playwright smoke test
docs/             decisions.md, content-guide.md
scripts/          gen-sfx.mjs (generates the sound effects)
```

All rules are pure functions in `packages/shared` (`startGame`, `applyGameAction`, `tickGame`):
state + action in, new state + animation events out. The server only wires them to sockets and
the clock, and sends each client a public state plus its own private state (answers, items,
mini-game secrets never leak before the reveal).

## Adding content

- **Questions, themes, packs, events, items, boards:** edit JSON in `packages/content/data/`.
  See [`docs/content-guide.md`](docs/content-guide.md).
- **Mini-games:** see [`packages/minigames/README.md`](packages/minigames/README.md).
- **Tuning** (coins, timers, tolerances, star cost, rewards): `packages/shared/src/config/game.ts`.

## Developer shortcuts

In the lobby, the host can open **Practice modes** to play question rounds without the board or
to jump straight into any mini-game.

## Not built yet

- Account linking / real-data questions (Steam etc.): the schema, scoring and DB models are in
  place, but linking and providers were deferred. Data tiles currently fall back to normal questions.
- German content: the content format and room setting support it; only a few strings are translated.

See [`docs/decisions.md`](docs/decisions.md) for design decisions.
