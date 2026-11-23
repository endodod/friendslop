# Content guide

All game content lives in `packages/content/data/` as JSON. Every file is validated with zod
schemas (`packages/shared/src/content/schemas.ts`) plus cross-file checks
(`packages/shared/src/content/lint.ts`). Run the lint test after any change:

```bash
pnpm lint:content     # or: pnpm test
```

The server also refuses to start with invalid content and prints every problem it found.
Restart the game server to pick up content changes.

## Text and languages

Any user-facing text is a *localized string*: either a plain string (in the pack's language) or
an object with `en` (required) and other languages:

```json
"prompt": { "en": "What's {target} eating at 3 AM?", "de": "Was isst {target} um 3 Uhr nachts?" }
```

If the room's language has no translation, English is used.

## Questions

Questions live in **packs**: `packages/content/data/packs/<pack-id>.json`. Any `.json` file in
that folder is loaded, so a new pack is just a new file.

```json
{
  "id": "my-pack",
  "name": "My Pack",
  "language": "en",
  "version": 1,
  "questions": [ ... ]
}
```

### Question fields

| Field | Required | Notes |
|---|---|---|
| `id` | yes | Unique across all packs, lowercase, e.g. `food.last-meal`. Never change it once shipped (stats use it). |
| `themes` | yes | Theme ids from `themes.json`. The first one sets the colour/icon shown with the question and is used to avoid the same theme twice in a row. |
| `format` | yes | `tiles`, `number`, `scale`, `player`, `ranking`, `higherLower` |
| `prompt` | yes | Localized string. Must mention `{target}` (except `player` "most likely to" prompts). |
| `answers` | tiles / ranking | `tiles`: 2–6 answers (4 is best). `ranking`: 3–4 items. |
| `number` | number / scale / higherLower | `{ "min", "max", "step", "unit"?, "tolerance": { "type": "absolute" \| "relative", "value" } }` |
| `scaleLabels` | scale | What the ends mean: `{ "min": "spotless", "max": "disaster zone" }`. Shown as "1 = spotless … disaster zone = 10". Required for `scale`, optional for `number`. |
| `reference` | higherLower | The value players compare against. Must be inside `number.min..max`. |
| `tags` | no | `spicy` (hidden by the family-friendly filter), `classic`, `quick`, `deep`, `mostLikely` |
| `weight` | no | Selection weight, default 1. |
| `minPlayers` | no | Only used with at least this many players (2–8). |
| `allowTargetChoice` | no | `player` format: allow picking the target. Off by default when the prompt mentions `{target}`. |
| `usage` | yes | Where it may appear: `tile` (board question tiles), `minigameIntro` (before mini-games, keep it quick), `questionOnlyMinigame` (Hot or Not / Duel use number questions, Most Likely To uses `mostLikely` player questions, Ranking uses ranking questions). |

Placeholders in prompts and answers:

- `{target}` — the player the question is about
- `{player:random}` — a random other player
- `{otherPlayer}` — another player, different from `{player:random}` when possible

### Examples

```json
{ "id": "food.3am", "themes": ["food"], "format": "tiles",
  "prompt": "It's 3 AM. What is {target} eating?",
  "answers": ["Cereal from the box", "Cold pizza", "Instant noodles", "Nothing, asleep like an adult"],
  "usage": ["tile", "minigameIntro", "questionOnlyMinigame"] }

{ "id": "life.tabs", "themes": ["life"], "format": "number",
  "prompt": "How many browser tabs does {target} have open right now?",
  "number": { "min": 1, "max": 200, "step": 1, "unit": "tabs", "tolerance": { "type": "relative", "value": 0.3 } },
  "usage": ["tile", "questionOnlyMinigame"] }

{ "id": "life.room", "themes": ["life"], "format": "scale",
  "prompt": "How chaotic is {target}'s room right now, 1–10?",
  "number": { "min": 1, "max": 10, "step": 1, "tolerance": { "type": "absolute", "value": 1 } },
  "scaleLabels": { "min": "spotless", "max": "disaster zone" },
  "usage": ["tile", "minigameIntro"] }

{ "id": "hot.pineapple", "themes": ["hot-takes"], "format": "higherLower",
  "prompt": "{target} rates pineapple on pizza a 5/10. Higher or lower?",
  "reference": 5, "number": { "min": 0, "max": 10, "step": 1, "unit": "/10", "tolerance": { "type": "absolute", "value": 0 } },
  "usage": ["tile", "minigameIntro"] }

{ "id": "hypo.jail", "themes": ["hypotheticals"], "format": "player",
  "prompt": "Who would {target} call first from jail?", "usage": ["tile", "minigameIntro"] }

{ "id": "party.rank-food", "themes": ["food"], "format": "ranking",
  "prompt": "Rank these the way {target} would, best first:",
  "answers": ["Pizza", "Burgers", "Sushi", "Tacos"], "usage": ["tile", "questionOnlyMinigame"] }
```

Writing tips: make it about the *person*, not trivia. "What's {target}'s favorite food?" is
boring; "{target}'s last meal on death row?" starts a discussion. Tolerances should make a
match feel earned but possible: relative 20–30 % for big numbers, absolute 1 for 1–10 scales.

### Data questions

A question with `"truthSource": { "provider": "steam", "generator": "steam.mostPlayed" }` is
generated at runtime from a player's linked data instead of the target's answer. Account linking
is not implemented yet; the Steam pack (`data-steam.json`) declares the questions and Data tiles
fall back to normal questions. Generators are registered in `packages/shared/src/data/generators.ts`.

## Custom questions (in the lobby)

Players can write their own questions in the lobby (multiple choice, 1–10 scale, number, pick a
player). They're validated with the same schema as shipped content, live in the room's **Custom**
pack (toggle it like any other pack), are picked twice as often as regular questions, and are saved
in the browser so they can be re-added in the next room with one tap. They are not written to the
content folder.

## Question packs in the lobby

Every pack file shows up as a toggle in the lobby (with its question count). Packs are the only
switch: themes are just tags (colour, icon, variety) and can't be turned off separately. Packs that only contain data questions are hidden until account linking exists.

Niche packs can set `"defaultEnabled": false`: new rooms start with them switched off and the host turns them on in the lobby (League does this).

## Themes

`themes.json`: `{ "id", "name", "icon", "color", "description" }`. Add a theme, then tag questions
with its id. The lobby picks up new themes automatically.

```json
{ "id": "travel", "name": { "en": "Travel", "de": "Reisen" }, "icon": "life", "color": "#2fd27a",
  "description": "Airports, lost luggage and dream trips." }
```

## Icons

Icons are referenced by id and live in `apps/web/public/icons/<id>.svg`. Use single-color SVGs
without a background (they're rendered as masks, so they take the theme's color). If you add a
game-icons.net icon, also add an entry to `apps/web/public/icons/credits.json` (CC BY 3.0
attribution, shown on `/credits`). The lint test fails if a referenced icon file is missing.

## Tiles

`tiles.json` defines tile *types*: `{ id, name, description, icon, color, effect, params, starEligible, pacingGroup }`.

Effects: `none`, `coins` (`params.amount`, negative to lose), `question`, `data`, `event`, `shop`, `duel`,
`item` (free random item, weighted by item `weight`; `params.fallbackCoins` when the bag is full).
`lucky` (roll a die, win roll × `params.multiplier` coins), `bank` (walking past pays `params.passCost`
into a shared pot, landing takes the pot), `thief` (steal `params.amount` from a random player; Shield blocks),
`mindReader` (only the lander guesses about a random other player, coins × `params.multiplier`).
The star can appear on any tile type (`starEligible` is no longer used). It skips Start and the first
few steps after it (`GAME_CONFIG.star`: one step per 10 tiles, at least 2), and never returns to a tile
until it has been on every allowed one. Landing on the star offers it first, then the tile's own effect runs.
`pacingGroup: "question"` tiles are thinned out on low
question pacing; `"filler"` tiles are turned into question tiles on high pacing.

## Boards

`packages/content/data/boards/<id>.json`. Positions are normalized (0..1) and rendered into an
SVG with the board's `aspect` ratio (width / height).

```json
{
  "id": "classic", "name": "Friendship Loop", "startTileId": "m0", "aspect": 1.6,
  "tiles": [
    { "id": "m0", "type": "start", "x": 0.075, "y": 0.5, "next": ["m1"] },
    { "id": "m5", "type": "blue", "x": 0.39, "y": 0.13, "next": ["m6", "a0"] }
  ]
}
```

- `next` lists where a token can go; two or more entries make a junction (the player chooses).
- The lint check requires every tile to be reachable from the start and to lead back to it, and only
  known tile types.
- `warpTo` (on a `warp` tile) names the tile a Warp Pipe sends you to. Pipes usually come in pairs that point at
  each other. Warp tiles can't be tuned in the tile mix.
- Every board in the folder shows up in the lobby's map picker (with a preview). Friendship Loop (classic) is the default.
- Shipped maps: Heartbeat (2–4 players), Friendship Loop (classic, 2–6), Island Hopper (4–8, 37 tiles), Orbit (3–8), Metropolis (4–8). Each has a Gamble, Rest Stops and Warp Pipes that link two neighbouring branches (a shortcut between paths that are close on screen but far apart on foot). The lobby also offers **Random**, which picks one of them when the game starts.
- `recommendedPlayers: { "min": 4, "max": 8 }` is shown on the map card. Every shipped map sets it.
- To try a map without enough friends, the host can **Add a bot** in the lobby. Bots play randomly (see `packages/shared/src/engine/bots.ts`).
- Players can tune how often each tile type appears (lobby → Tile mix: Off / Few / Normal / Many).
  "Normal" is the board as designed; extra tiles are taken from blue tiles, and at least
  `GAME_CONFIG.tiles.minFillerTiles` blue tiles always stay for the star.

## Items

`items.json`: `{ id, name, description, icon, price, useTiming, effect, needsTarget, weight }`.

- `useTiming`: `turnStart` (before rolling), `onQuestion` (while answering, before locking in), `passive` (automatic).
- `effect` must be one of the implemented effects: `doubleDice`, `customDice`, `steal`,
  `pickTarget`, `shield`, `peek`, `wideTolerance`, `warpToStar`, `sprint` (`params.bonus` extra steps),
  `pushBack` (`params.steps`), `swapPlaces`, `freeze` (target skips their next turn), `coinMagnet`
  (`params.amount` from every other player), `stealStar`, `luckyCharm` (onQuestion: double your coins),
  `starCoupon` (passive: next star costs `params.discount` less), `bankHeist` (take the Piggy Bank pot).
  `doubleDice` takes `params.dice` (3 = Triple Dice), `steal` takes `params.amount`.
- `params` holds effect numbers; `weight` controls how often it shows up in shops and on Item tiles. New effects need code in
  `packages/shared/src/logic/items.ts` (turn start) or `engine/game.ts` (question time).

## Event cards

`events.json`: `{ id, name, description, icon, effect, params, negative, weight }`.

Effects: `swapRandom`, `allMoveBack` (`params.steps`), `stealFromLeader` (`params.amount`),
`giveLastPlace`, `everyoneCoins`, `loseCoins`, `moveStar`, `teleportRandom`, `shareWealth`.
`negative: true` events can be blocked by a Shield. Tune `weight` to make cards rarer.

## Bonus stars

`bonusStars.json`: `{ id, name, description, icon, stat, mode, requiresTargetAtLeastOnce }`.
2–3 are chosen at random per game. `stat` is one of the tracked player stats
(`matchesMade`, `matchedAsTarget`, `minigameWins`, `perfectMatches`, `coinsEarned`, `redTiles`,
`stepsMoved`, `itemsUsed`); `mode` is `max` or `min`. Ties all get the star.

## Mini-games

Metadata in `minigames.json`: `name`, `icon`, `goal` (one line, shown on the tutorial screen and as a
banner while playing), `howTo` (2–4 tutorial steps), `rules`, `controls`, `bonus`, `weight`, `enabled`. Set `weight: 0` or `enabled: false` to take one out of rotation. The logic and UI are
code: see `packages/minigames/README.md`.

## Tuning numbers

Coins, timers, tolerances, star cost and rewards are in `packages/shared/src/config/game.ts`.
