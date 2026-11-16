# PartyGame

A browser-based party board game for 2–4 friends. Every question is about one player (the **target**); everyone answers, and you score by landing on the same answer as the target.

> Working title. Rename it in one place: `packages/shared/src/config/branding.ts`.

## Run it

Requirements: Node 22+, pnpm 10, optionally Postgres 16 (or Docker).

```bash
pnpm install
cp .env.example .env            # adjust DATABASE_URL / STEAM_API_KEY
pnpm --filter @party-game/server exec prisma migrate deploy   # only if you use Postgres
pnpm --filter @party-game/server exec prisma generate
pnpm dev                        # game server on :4000, web on :3000
```

Or everything in Docker:

```bash
docker compose up --build
```

Open http://localhost:3000. Phones on the same Wi-Fi: http://<your-computer-ip>:3000.

## Tests

```bash
pnpm test        # Vitest: rules, scoring, movement, state machine, content lint
pnpm typecheck
```

See `docs/decisions.md` for design decisions and `docs/content-guide.md` for adding content.
