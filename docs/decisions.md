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

## Scope changes
- **Account linking / Steam integration (Milestone 7) is skipped for now** at the product owner's request. What remains in place: the `truthSource` field in the question schema, the data-question scoring rules (×2, target self-check), `DataProvider`-ready types (`PlayerDataBundle`, `DataQuestionGenerator`, an empty generator registry), the Prisma models for linked accounts and snapshots, and the declared Steam questions in `data-steam.json`. Data tiles fall back to normal question tiles because no player has data. The lobby only shows the "data questions" toggle once some player has linked data.

## Mini-games
- **Mini-game metadata** (name, rules, controls, bonus text, weight) is content; logic + UI are code modules in `packages/minigames/src/<id>/`.
- **Solo games** share the seed and are played locally; the server recomputes the score from submitted inputs where cheap (Stacker drop timings, Memory flip sequences, Simon presses, Spot-the-odd taps, Count-it, Quick math, Color clash, Higher/lower guesses, Whack hits) and rejects implausible input (reaction < 100 ms, drops < 120 ms, > ~25 typed chars/s, too many answers per second). Since layouts come from the shared seed, a determined cheater could precompute them; this is a friends' game, so that's accepted.
- **Pump It** is validated per pump on the server (pop points stay secret), and rate-limited to human tapping speed.
- **Realtime games** (Red Light, Chicken, Musical Chairs) run on the 15 Hz server tick. Red Light ignores holding for 220 ms after the light turns red (latency grace).
- **Red Light ends when the first player finishes**; everyone else is ranked by distance.
- **Musical Chairs bonus:** chairs show (and can be taken) 200 ms earlier for bonus players.
- **Hot Potato** runs several fuses until one player is left; a wrong answer gives a new prompt and a 0.6 s lockout.
- **Split or Steal** is only picked in 2-player games (`maxPlayers: 2`); an undecided player counts as "split". Payout is created from a 10-coin pot.
- **Mystery Auction:** sealed bids, total bids capped at your coins, highest bid pays and gets the box (ties → whoever locked in first). Net result is paid out (can be negative).
- **Duel:** at 3–4 players a third player (least targeted) is the target and answers truthfully; the closer duelist steals 5 coins. At 2 players the challenger guesses about the opponent: within tolerance → challenger steals 5, otherwise the opponent does. Steals are real transfers (`transfers` hook), so no coins are created.
- **Speed Sync:** match = 2 points, +1 if locked in during the first half of the 8 s window; the target gets 1 per matcher.
- **Ranking:** 1 point per item in the correct position; the target answers truthfully and scores nothing.
- **Practice mode:** hosts can start any mini-game directly from the lobby (they then cycle). It doesn't affect board games.

## Hosting
- **Free hosting target:** web on Vercel (Root Directory `apps/web`), game server on Render's free web service via `render.yaml`. The server can't run on serverless platforms (long-lived WebSockets, in-memory rooms, 15 Hz tick).
- Render's free plan sleeps when idle, so the web app pings `/health` on page load and shows a "waking up" message while the socket can't connect. The Render start command runs `tsx` directly (no pnpm at runtime) to keep cold starts short.
