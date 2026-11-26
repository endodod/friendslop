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
- **More tile variety:** Lucky (die roll × 2 coins, ×2 on the board), Piggy Bank (collects every coin lost on red tiles; landing takes the pot. Originally passing paid 2 coins in; changed so the pot grows from bad luck instead of a toll), Mind Reader (only the lander guesses about the least-targeted other player, double coins; no "pick a player" questions with only two people answering), Thief (steal 4 from a random player). They replaced the two Data tiles (inert without account linking) and three blue tiles. The help legend only lists tile types that are on the current board.
- **More themes:** Friend Group, Childhood, Internet & Phones, Money, Travel, Love & Dating, School & Work, Party & Nightlife (9 questions each, 146 questions total). All themes are enabled by default.
- **Lobby settings:** map choice (4 maps with previews), question pack toggles (plus the room's Custom pack), and a per-tile-type "Tile mix" (Off/Few/Normal/Many) that replaced the old question-pacing setting. Themes stay as a filter inside the packs.
- **Custom questions** are room state (public, they contain no answers), limited to 80 per room, removable by their author or the host, and only editable in the lobby. They skip the theme filter (their theme is "Custom").
- **New items:** Sprint Shoes (+3 steps, 4), Push Back (target back 4 spaces, 6), Swap Places (7), Freeze (target skips their next turn, 9). Push/Swap/Freeze are blocked by Shield. Shops now show 5 of the 12 items.
- **League of Legends pack:** 12 questions about the group's League habits (roles, tilt, flame, pings).
- **Unlocked answers count:** while answering, the client sends the current selection as a hidden draft (`question:draft`); when time runs out, drafts become answers. Question-only mini-games auto-lock the current selection ~0.7 s before the deadline instead.
- **Player questions about the target** ("Who would {target} call from jail?") don't offer the target as a choice and are skipped with only 2 players. `allowTargetChoice: true` opts out.
- **Up to 8 players.** Placement coins for 5–8 players: 5 `[10,6,3,1,0]`, 6 `[10,6,4,2,1,0]`, 7/8 `[10,7,5,3,2,1,0(,0)]`. Split or Steal stays 2-player only. Thin Ice has 8 start spots; Musical Chairs uses a 3×3 grid of chair spots.
- **Metropolis** (50 tiles, 4 junctions, central hub) is recommended for 4–8 players (`recommendedPlayers` on the board, shown on the map card). Map generation avoids two identical special tiles next to each other.
- **Tile counts are per map** (roughly one Shop per 10–15 tiles: Figure Eight/Ladder 2, Friendship Loop 3, Metropolis 4). The Tile mix setting scales relative to each map; nothing scales with the number of players.
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
- **Quick Loop removed;** the map picker has a **Random** card in its place (`settings.boardId = "random"`, resolved with the game's RNG in `createGame`).
- **Unlimited rounds:** `turnCount: 0` (∞ in the lobby) never ends on its own; it ends at the star goal or when the host taps the flag (`game:finish` → `gameEnd`, which hands out bonus stars and shows the podium). The flag works in limited games too.
- **Item prices can scale with the lobby** (`pricePerOpponent`): Coin Magnet costs 2 + 2 per other player (4 at 2 players, 16 at 8), about two thirds of what it can take.
- **Room chat:** `chat:send` (players only, 200 chars, one message per 0.6 s). The last 60 messages live on the server's room record (not in game state, not persisted) and are sent on (re)join. Floating button bottom-right with unread badge and a preview bubble; TVs can read but not write.
- **After the bonus stars** the final standings stay up for 12 s (`bonusStarsHoldMs`) before the results page; the host can tap "Show final results".
- **Board look:** per-map accent colour, arena-style backdrop, scattered scenery, a soft track bed under the roads, layered roads with a dashed centre line, 3D tiles, pin-shaped tokens with a bobbing marker and a pulse under the active player.
- **Confetti** renders in a portal on `document.body` (a transformed parent used to clip it) and rolls its randomness once per burst; it now fires from both lower corners plus a few pieces from the top.
- **Ambient animations** (CSS, off with reduced motion): board sparkles twinkle, road centre lines flow, junction rings turn, a slow drifting glow behind the board, tiles pop in on load and squash when a token hops on them; Roll! breathes and shines; cards rise in; coin/star numbers pop green/red when they change; the landing title floats; chunky buttons lift on hover.

## Playtest batch (accounts follow-up)

- **Piggy Bank** fills from red-tile losses instead of a walk-past toll. **Start**: passing or landing on it gives another roll once the turn is over (it used to pay +5 coins).
- **Item tiles** drop strong items rarely: weight × (6 / effective price)^1.5 (`economy.itemDrop`). Shops are unchanged.
- **Bonus stars** are drawn at random from the highlight categories (`bonusStars.json`, now also Biggest Thief and a
  per-question Enigma), only among categories somebody won; count = 1 + ceil(players / 2). The results page shows one
  Highlights list with the starred categories first. No category is guaranteed any more.
- **Ties:** mini-game scores no longer hide tie-breakers the label doesn't show (Stacker width, Memory Flip flip
  count, Red Light finish order within one tick). Same label = same place.
- **Reaction Tap:** best of 3 tries; a false start disqualifies (last place); the question bonus is a 4th try.
- **Minefield:** when only the bomb is left, the field is re-dealt instead of forcing the next player onto it.
- **No skipped screens:** full-screen phases (mini-games, questions) wait on the client until the token has finished
  walking plus a short landing beat; the tile-effect panel waits too (tileEffectMs got +400 ms of slack). Mini-game
  results open with a 2.4 s personal outcome screen ("You won!" / "You lost!") that the host can't skip, then the table.
- **Chat** is part of the page (lobby, under the game log) instead of a floating popup.
- **No cursed names:** an earlier version limited players with offensive names to rolls of 1–3. It was removed
  completely; names don't affect gameplay.
- **Star placement:** the star can sit on any tile type. It never appears on Start or within
  `max(2, round(tiles / 10))` steps after it, and never goes back to a tile it already used this game until it has
  visited every allowed tile (then the history resets). Landing on it: buy/decline first, then the tile's effect.
  Walking past it on a Shop: star offer first, then the shop.
- **Game screen layout (wide):** the player list is a strip of small chips along the top edge inside the map frame
  (tap a chip for that player's items); the board is fitted into the space below, so it never covers tiles, for any
  player count (checked with 8 players on every map at 1280×720 up to 1920×1080). The right
  column is a fixed split: turn panel (dice, shop, star…) on top, scrolling inside so it never grows, chat below.
  The "What happened" card is gone; the top bar shows just the latest item use (with what it did), item buy or
  star buy, centered. Log entries carry a `kind` for this; others stay in the state but aren't shown.
- **Junction highlight:** only the roads leaving the junction you stand on light up, not every road into the
  option tiles.

## Games hub
- **Two engines, one room.** The party board game keeps its own engine (`room.game`). Every other game is a
  `HubGameDefinition` run by a small shared runtime (`room.hub`, `packages/shared/src/hub/engine.ts`): tutorial with
  "Got it!", pause (same game-clock trick as the board game), phase timers, autoplay for players who are gone,
  host skip, bots, podium and projection. Games only write rules over their own state.
- **The room's game is a lobby setting** (`settings.gameId`, picked on the hub page or switched by the host). Other games'
  settings live in `settings.hub` so switching back and forth keeps them.
- **Original names and looks:** Spy Grid, Spectrum and Bluff Club follow well-known party-game genres (team word clues,
  a dial between opposites, bluffing answers) with their own names, teams, content and visuals.
- **Spy Grid voting:** guessers vote on phones; a word is revealed once a majority of the team's guessers who are here
  agree (one guesser = instant). "End our turn" works the same way. The clue-giver role goes to a volunteer, else to
  someone who didn't give clues last game (humans before bots). A clue-giver who leaves hands the role to a teammate.
- **Spectrum** is free-for-all on a 1–10 scale (whole numbers, easy to tap on a phone): everyone picks their own number, and the clue-giver scores the average, so clear
  clues pay. Clues may not contain digits.
- **Bluff Club** is about the players (like the board game's questions), not trivia: the spotlight player writes the
  truth. Fakes identical to the truth (ignoring case, punctuation, "a/the") make you a mind reader (+3, no vote);
  identical fakes are merged and share the credit. House lies pad the list to 4 answers.
  Every answer (truth, fakes, house lies) is stored in one style: lowercase, no punctuation (apostrophes and hyphens
  inside words stay, emoji stay), so nobody gives themselves away with a capital letter or an exclamation mark.
- **Brief disconnects don't end a step.** A step that waits for everyone (guesses, answers, votes) only stops waiting
  for a player once they've been gone `disconnectedAutoplayMs`, so a page refresh doesn't cost your answer.
- **Per-game account stats** (`UserGameStat`); `User.gamesPlayed/gamesWon` stay the totals. The migration backfills
  existing totals as Party Board games.

## Party Board changes (after playtests)
- **3 players minimum** for the board game (practice modes still run with 2).
- **Rounds:** 5 / 10 / 12 / 15 / 20 / ∞.
- **Answer options:** never more than 4 (`question.maxOptions`): "pick a player" questions show 4 random eligible players,
  5-answer tile questions show 4 of their answers. Rankings keep all their items.
- **Start tile:** passing or landing on it gives another roll once the turn is over (instead of +5 coins).
- **Shop:** always stocks at least one way to a star: Star Thief, Swap Places or Star Warp.
- **Vote and question mini-games have no clock** (`untimed`: Most Likely To, Judge's Call, Hall of Fame, Ranking, Speed Sync,
  Duel, Hot or Not). Each step waits for everyone present (players gone longer than `disconnectedAutoplayMs` are skipped);
  the host can press "End mini-game" for an AFK player. Speed Sync keeps its speed bonus for answering within 4 s.
  Finish-the-task games are untimed too (Memory Flip, Number Hunt, Type Race, Simon, Higher or Lower, Stacker, Minefield,
  Thin Ice): they run until everyone is done or out; Minefield and Thin Ice have no turn countdown either (the game only moves
  for a player who left). Games where the clock is the game keep it (Quick Math, Color Clash, Arrow Rush, Pump It,
  Whack-a-Mole, Reaction Tap, Perfect Timing, Stop the Bar, Count It, Spot the Odd One, and the live ones).
- **Chance tiles build suspense:** the Lucky die tumbles and the Gamble coin spins for about a second before the coins show.
- **Underdog** was removed.
- **Late joiners:** joining a running game gives a seat at the end of the turn order, on Start, with the average coins of the
  others (at least the starting coins) and no stars. Hub games add the newcomer's rounds at the end (Spy Grid: smaller team).
- **Token animations:** moves sent in one update (e.g. "Everyone moves back 3") walk at the same time, and the board waits a
  moment before snapping to new server positions so it doesn't jump ahead of the walk.

## More hub games
- **Play modes:** every game in the catalog has a `mode` (`ffa`, `teams`, `coop`), shown as a chip on every
  game card and used by the home page's filter. Tags no longer repeat the mode.
- **Collapsible game picker:** the lobby shows only the current game; *Change game* expands the full list,
  and picking a game collapses it again (the list grows with the hub).
- **Co-op results:** `HubResults.coop` (`score`, `total`, `rating`, `text`). Everyone gets rank 1 with the crew's
  score; `winners` is everyone when the crew did well (Clue Crew: half the deck; Count Up: every level), else
  nobody, so account stats count co-op wins too. The podium shows one crew card instead of a top 3.
- **Who Wrote That?** is about the players, like Bluff Club, but anonymous: everyone answers the same question,
  then each answer is guessed one by one (only players who answered can be picked). Prompts with fewer than two
  answers are skipped.
- **Clue Crew** deals Spy Grid words. Clues are one word; duplicates (same `wordKey`: case, articles and simple
  plural/verb endings ignored) cancel automatically, and clue-givers can strike near-duplicates in a short check.
  Guesses forgive one typo for words of 5+ letters, and any clue-giver can count a near miss. A wrong guess burns
  the next card (on the last card: one solved card is lost). With 3 players each clue-giver writes 2 clues.
- **Count Up** is real-time on the hub runtime: actions are applied in arrival order. Lives = players (2–5),
  one sync to start; rewards after set levels. Nobody playing for 60 s **loses** the game (clients warn for
  the last 10 s): auto-playing the lowest card instead would let a crew wait out every level and always win.
  Players who are gone for good have their cards set aside so the rest can go on.
- **Odd Word Out:** the odd one out doesn't know it. Clues go in turn, two laps, 30 s each (time out = no
  clue); a clue can't contain your own word or repeat an earlier clue. A tie in the vote accuses nobody.
  Caught players get a last chance to guess the crowd's word.
- **Lucky Low** (lowest unique number) was built and dropped in favour of Count Up.
- **Late joiners in the newer games:** Who Wrote That? lets them join in from the current step; Odd Word Out adds
  one round at the end with them as the odd one out; Clue Crew gives them the last seat in the guesser rotation;
  Count Up deals them cards from the next level (and caps the level count so 100 cards are always enough).
