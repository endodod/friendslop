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
- **Lone Wolf** (3+ players): 3 rounds of secretly picking 1…(players+3, max 10); duplicates cancel out, the lowest unique number wins the round (bonus: wins count double).
- **Tug of War:** two random teams mash PULL for 20 s after a 2 s ready phase. A tap's strength is scaled by team size so uneven teams stay fair; taps faster than 55 ms are ignored. Winners share rank 1.
- **Arrow Rush** (solo): press the arrow's direction, red arrows mean the opposite; wrong presses cost a point (bonus: free). Server replays the presses; more than 7/s is rejected.
- **Number Hunt** (solo): tap 1–25 in order on a shuffled 5×5 grid; time + 1 s per wrong tap, unfinished runs rank after finishers by numbers found (bonus: 1–3 pre-found).
- **Practice mode:** hosts can start any mini-game directly from the lobby (they then cycle). It doesn't affect board games.

## Hosting
- **Free hosting target:** web on Vercel (Root Directory `apps/web`), game server on Render's free web service via `render.yaml`. The server can't run on serverless platforms (long-lived WebSockets, in-memory rooms, 15 Hz tick).
- Render's free plan sleeps when idle, so the web app pings `/health` on page load and shows a "waking up" message while the socket can't connect. The Render start command runs `tsx` directly (no pnpm at runtime) to keep cold starts short.

## Playtest feedback
- **Tutorials:** the game start and every mini-game intro are tutorial screens (goal + steps). They end when everyone taps "Got it!" (max 30 s; the host can skip). Practice modes skip the board tutorial. While a mini-game runs, a goal banner with a "?" (full rules) stays on top. A "?" in the top bar explains board rules, tiles and items at any time.
- **Scale questions (1–10)** label both ends (`scaleLabels`) and pay by distance: exact 5, one off 3 (match), two off 1 ("close", not a match), further 0. Wide Tolerance halves the distance.
- **Spending coins:** walking past a Shop stops you to shop (only if you can afford an item and have room), like passing the star. New item: Star Warp (12 coins) teleports you right in front of the star. Your turn screen always shows your items or where to get them.
- Fixed: the target's answer reveal could hang because the "?" card's exit animation inherited the drumroll's infinite repeat.
- **More coin sinks:** a third Shop on the main loop stretch every player walks (m15), and two pink Item tiles (m3 near the start, a2 on the upper shortcut) that give a free random item when you land on them; with a full bag (3 items) you get 3 coins instead.
- **More tile variety:** Lucky (die roll × 2 coins, ×2 on the board), Piggy Bank (passing pays 2 coins into a pot, landing takes it), Mind Reader (only the lander guesses about the least-targeted other player, double coins; no "pick a player" questions with only two people answering), Thief (steal 4 from a random player). They replaced the two Data tiles (inert without account linking) and three blue tiles. The help legend only lists tile types that are on the current board.
- **More themes:** Friend Group, Childhood, Internet & Phones, Money, Travel, Love & Dating, School & Work, Party & Nightlife (9 questions each, 146 questions total). All themes are enabled by default.
- **Lobby settings:** map choice (4 maps with previews), question pack toggles (plus the room's Custom pack), and a per-tile-type "Tile mix" (Off/Few/Normal/Many) that replaced the old question-pacing setting. Themes stay as a filter inside the packs.
- **Custom questions** are room state (public, they contain no answers), limited to 80 per room, removable by their author or the host, and only editable in the lobby. They skip the theme filter (their theme is "Custom").
- **New items:** Sprint Shoes (+3 steps, 4), Push Back (target back 4 spaces, 6), Swap Places (7), Freeze (target skips their next turn, 9). Push/Swap/Freeze are blocked by Shield. Shops now show 5 of the 12 items.
- **League of Legends pack:** 12 questions about the group's League habits (roles, tilt, flame, pings).
- **Unlocked answers count:** while answering, the client sends the current selection as a hidden draft (`question:draft`); when time runs out, drafts become answers. Question-only mini-games auto-lock the current selection ~0.7 s before the deadline instead.
- **Player questions about the target** ("Who would {target} call from jail?") don't offer the target as a choice and are skipped with only 2 players. `allowTargetChoice: true` opts out.
- **Up to 8 players.** Placement coins for 5–8 players: 5 `[10,6,3,1,0]`, 6 `[10,6,4,2,1,0]`, 7/8 `[10,7,5,3,2,1,0(,0)]`. Split or Steal stays 2-player only. Thin Ice has 8 start spots; Musical Chairs uses a 3×3 grid of chair spots.
- **Metropolis** (50 tiles, 4 junctions, central hub) is recommended for 4–8 players (`recommendedPlayers` on the board, shown on the map card). Map generation avoids two identical special tiles next to each other.
- **Tile counts are per map** (roughly one Shop per 10–15 tiles: Quick Loop 1, Figure Eight/Ladder 2, Friendship Loop 3, Metropolis 4). The Tile mix setting scales relative to each map; nothing scales with the number of players.
- **Win condition** (lobby): most stars after the last round (default), or first to 3 / 5 stars. In a star race the game ends the moment someone buys the winning star; the round count is the time limit, and no bonus stars are handed out when the race is won.
- **Fixed:** the Party & Nightlife pack had overwritten the original Party pack (Most Likely To prompts, rankings). Restored as "Group Classics" (`core-party`); Party & Nightlife is `core-nightlife`. A test now checks pack ids are unique and question-only mini-games have enough questions.
- **Economy pass:** item prices raised (average ≈ 6 → 12 coins; Steal now takes 10 coins). Six new items: Triple Dice (14), Coin Magnet (12), Star Thief (45, rare), Lucky Charm (8), Star Coupon (7, passive), Bank Heist (10; not sold/handed out on maps without a Piggy Bank). More Shops on every map (Quick 2, Figure Eight 3, Classic 4, Ladder 4, Metropolis 6).
- **Board paths show direction arrows** (yellow when leaving a junction), also in the lobby map previews.
- **Removing players mid-game:** the host can remove a *disconnected* player during a game (button on their scoreboard entry; connected players can only be kicked in the lobby). They leave order, players and room; if it was their turn the next player is up; a question about them is dropped and a guesser leaving can end answering early; mini-games give them no placement or coins; a duel they were in ends. With fewer than 2 players left the game ends.
- **Direction arrows** are only drawn on paths leaving a junction (and on the paths you can pick right now), not on every segment.
- **Keyboard:** on desktop, Space rolls the dice on your turn and works as the tap in Reaction Tap, Stacker, Stop the Bar, Perfect Timing, Count It and Pump It (Enter = stop); ↑/↓ in Higher or Lower. Hold games already used Space. Hints only show on devices with a mouse.
- **Simon fix:** solo mini-games wait for the private seed before mounting (the private state arrives right after the public one; Simon used to start from a fallback seed and judge presses against a different sequence).
- **No repeats across games:** a room remembers the question ids it asked (`askedQuestionIds`, last 800). Selection prefers never-seen questions, then the least recently asked; the same prompt text never comes twice in one game.
- **Themes merged into packs:** the separate theme filter is gone (`settings.themes` removed); packs are the only switch. Group Classics got its own `classics` theme instead of borrowing "Life".
- **Orbit map** (46 tiles): inner ring of 14 tiles; four junctions lead out to corner districts (6-tile loops with a shop each) and back onto the next ring tile.
- **Mini-game visuals:** shared kit (`packages/minigames/src/kit/visual.tsx`: arena, HUD pills, time bar, round dots, pop text, chunky buttons, score strip); every mini-game got its own themed look.
- **Items are public:** every player's items are in the public state (`items` next to `itemCount`). The scoreboard shows item icons; tap a player to see the list with descriptions.
- **Host pause:** the host (or a TV display) can pause a running game. Every deadline is on a *game clock* (real time minus time spent paused, `engine/pause.ts`), which stands still while paused, so timers continue where they stopped. Ticks and actions are refused while paused (solo mini-game results still count). Clients freeze `serverNow()` and show an overlay; solo mini-games use the pause-aware `gameNow()` from `kit/clock.ts`. Simon replays its sequence, Reaction Tap and Count It restart the interrupted round.
- **Game finished page:** the podium screen now shows star awards with their values, group highlights (best mind reader, hardest to read, mini-game king…), per-player stat cards (question match rate, read-by-others rate, mini-game win rate, coins, steals, items, steps) and achievements. **Achievements** (`logic/achievements.ts`, 17 badges) give no stars and are computed from public stats. **Bonus stars** can be rates (`per` + `minPer`) and `always` included: *Sharpshooter* (best question match rate, 3+ guesses) is handed out every game; new random ones: Mini-game Ace (win rate), Tycoon, Gadgeteer, Crowd Pleaser. 3–4 bonus stars per game (was 2–3).
- **More content:** every themed pack has ~50 questions (was ~26), Group Classics has 121 Most Likely To and 20 rankings, and six new packs with their own themes: Sports & Fitness, Animals & Pets, Style & Looks, Tech & Gadgets, Secrets & Confessions (a few `spicy`) and Would You Rather (two-answer tiles). New packs are on by default like every pack.
- **Mini-game mix** (lobby, like the tile mix): per mini-game Off / Few / Normal / Many. Weight multipliers 0 / 0.35 / 1 / 2.5; Many may come up twice per cycle; never the same game twice in a row; at least one must stay on. Practice mode ignores it.
- **Hot Potato** has no maths any more: each pass is a random reflex challenge (match the picture, tap the ink colour, odd one out, count the dots). Bonus = one revive.
