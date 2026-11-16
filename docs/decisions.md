# Decisions

Defaults picked where the build prompt left room, or where the environment forced a choice.

## Architecture
- **TypeScript sources are consumed directly** across the workspace (no package build step): Next.js uses `transpilePackages`, the server runs with `tsx`, Vitest reads TS natively.
- **Engine purity:** every rule lives in `packages/shared`. Entry points (`startGame`, `applyGameAction`, `tickGame`) clone the room state (`structuredClone`) and return `{ room, events }`. Internally they mutate the clone, which keeps the phase code readable while staying pure from the outside.
- **Timers are data:** each phase stores `phaseEndsAt`; the server ticks every room at 15 Hz and calls `tickGame`, which fires the phase's default action when the deadline passes (and drives realtime mini-games). There are no per-phase `setTimeout`s.
- **RNG:** all randomness goes through a seeded `Rng` passed in the engine context (one per room on the server, `GAME_SEED` env makes games reproducible).
- **Content dependency direction:** `content` depends on `shared` (for schemas). The engine receives content as a parameter, so `shared` never imports `content`.
- **Boards and packs are read from disk by the server** (`packages/content/src/node.ts` scans `data/packs/*.json` and `data/boards/*.json`), so dropping in a new file is enough. Browsers get themes/tiles/items/events/bonus stars/mini-game metadata statically and fetch board geometry from `GET /content/boards/:id`.
- **Mini-game metadata** (name, icon, rules, controls, bonus text, weight, enabled) is content in `minigames.json`; the module in `packages/minigames` holds logic + UI. The content test checks both sides match.
- **Live room state** is in memory behind a `RoomStore` interface; the per-room RNG is a closure, so a Redis store would also need to persist the RNG state (`RoomRecord.rngState` is reserved for that).
- **Postgres is optional at runtime:** without `DATABASE_URL` or when unreachable the server logs a warning and runs without persistence. All writes are fire-and-forget (`safely()`).
- **Prisma 7** (pinned to 7.10.1; `latest` on npm was an 8.0 release candidate) with the `prisma-client` generator and the `pg` driver adapter.

## Rooms & devices
- If the room is created from a shared display (TV), the **first player to join becomes host**. Displays may also use host controls (they are the shared screen in the room).
- **Layout is picked automatically:** if at least one display is connected, phones act as controllers (no board, "Show board" button); otherwise every player sees board + controls (online mode).
- Seat tokens live in `localStorage` per room (`party-game:seat:<CODE>`). Only one socket per seat: a newer connection with the same token replaces the old one.
- Lobby players who stay disconnected for 3 minutes are removed so the ready check isn't blocked forever. In-game seats are kept for the whole game.
- **Play again** restarts immediately with the same players and settings; "Back to lobby" lets the host change settings.
- Turn count options are 10 / 12 / 15 / 20 (12 is the default the prompt asks for, so it's selectable too).

## Rules details
- **Movement:** the junction choice is asked whenever the token stands on a junction with steps left. Passing the star (moving onto it with steps left) pauses movement for the purchase, then continues. Landing on the star replaces that tile's effect.
- **Star purchase timeout** defaults to *buy if affordable* (kinder to disconnected players).
- **Relative tolerance** never drops below one `step`, so a truth of 0 is still guessable.
- **Ranking** counts as a match when at least half of the items are in the right position (`rankingMatchShare`), perfect when all are. Points (score) = share of correct positions.
- **Perfect bonus** (+2) applies to `number` and `scale` formats.
- **Data questions:** the target still earns +2 per guesser who matched the real answer (×2 like everything else); the +3 for being right about themselves is not multiplied.
- **Mini-game bonus for the target on data intro questions:** the target gets the bonus if they were right about themselves.
- **Items:** Peek and Wide Tolerance are `onQuestion` items, used while answering (before locking in). Shield is passive and consumed automatically. Only one dice-modifying item per turn.
- **Pick the Target** overrides the next question round anywhere (tile or mini-game intro).
- **Bonus stars:** ties give the star to everyone tied. A "max" award with a best value of 0 goes to nobody. Enigma/Open Book only consider players who were target at least once.
- **Placement coins** for fewer players: 2 players `[10, 2]`, 3 players `[10, 5, 0]`, 4 players `[10, 5, 2, 0]`.
- **Question pacing:** low turns half of the question tiles into blue tiles, high turns extra blue tiles into question tiles.
- Engine-generated texts (event outcomes, log lines) are English only for now; content (questions, themes, items…) supports `de`.

## Assets
- **Sounds:** Kenney.nl was not reachable from the build environment, so all sounds are synthesized by `scripts/gen-sfx.mjs` (original, CC0). Swap in Kenney packs later by replacing the files in `apps/web/public/sfx/` (same names).
- **Icons:** game-icons.net SVGs (CC BY 3.0) downloaded into `apps/web/public/icons/`, background square removed so they work as CSS masks. Attribution data in `public/icons/credits.json`, rendered on `/credits`. `star.svg` and `cards.svg` are original.
- **Fonts:** Lilita One (display) + Inter (body) via `@fontsource` packages, so builds don't depend on Google Fonts at build time.
