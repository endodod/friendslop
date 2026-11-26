# Game ideas for the hub

Ideas for new hub games, chosen to fit what the site already does well: phones as controllers,
2–8 friends, a TV or a Discord call, and questions **about the players themselves**. Each one is
written so it can be a `HubGameDefinition` (phases with timers, pure rules, bots, podium), and like
Spy Grid, Spectrum and Bluff Club, each takes a known party-game *genre* but has its own name,
rules, content and look.

> **Built so far:** Who Wrote That? (#2), Clue Crew (#3), Count Up (#7) and Odd Word Out (#5, the
> "Imposter Word" idea), plus play-mode tags and a collapsible game picker. Lucky Low (#4) was built and
> then replaced by Count Up.

**What the hub had before:** a board game, team word clues (Spy Grid), a dial between two opposites
(Spectrum) and bluffing answers (Bluff Club). **What's missing:** drawing, hidden roles / social
deduction, co-op, "match the group", real-time play, and quick filler games for between longer ones.

Effort: **S** = reuses existing pieces (text input, `normalizeAnswer`, voting, podium), about
Bluff Club size. **M** = one new piece of UI or engine. **L** = a new shared system (e.g. a drawing canvas).

---

## Tier 1: best fit, low effort

### 1. Herd Mind — *think like the group* (3–8, 10–15 min, S)
A prompt like "Name a breakfast food" or "Best Mario Kart character". Everyone writes one answer
privately. Answers are grouped (`normalizeAnswer` + host can merge near-duplicates on the reveal).
- Everyone in the **biggest group** gets +1. Ties for biggest: nobody scores.
- The only player with a **unique answer** gets the **Lone Sheep** 🐑 card; while you hold it you
  can't win. It passes to the next lone answer.
- First to 8 points without the sheep wins.

Why it fits: dead simple, loud, works with any group size, fun on a call. Reuses Bluff Club's text
input and grouping almost one to one. Content: a `hub/herd.json` prompt list; many of the existing
packs' open questions can be re-used ("about the group" prompts like "Who here is most likely to
be late?" work too, answers are player names).

### 2. Who Wrote That? (built) — *anonymous answers, guess the author* (4–8, 15–20 min, S)
Prompts about yourself: "Your most useless talent", "The worst gift you ever got". Everyone answers
anonymously. Then each answer is shown one at a time and everyone else guesses who wrote it.
- +2 per correct guess; the author gets +1 for every player they fool (being hard to read pays).
- Final round "Self-portrait": one answer each about the person on your left.

Why it fits: the purest "how well do you know your friends" game, the site's core theme. Reuses
the board game's question packs (`core-confessions`, `core-childhood`, `core-guilty-pleasures`…)
directly; the podium can reuse the board game's "best mind reader / hardest to read" highlights.

### 3. Clue Crew (built) — *co-op one-word clues* (3–8, 15 min, S)
Co-op. One guesser per round; everyone else sees the secret word and writes one clue word.
Identical clues **cancel out** before the guesser sees them, so be helpful *and* unique.
The guesser gets one guess. The team scores out of 13 cards, with a rating at the end
("Mind-meld legends" → "Did you even try?").

Why it fits: the hub has no co-op game yet, and this is the easiest one to teach. Reuses the Spy
Grid word list, `normalizeAnswer` for duplicate checks (plus simple stemming: "fish" = "fishes").
Podium is a team result (the `teams` field of `HubResults` with one team, or a co-op variant).

### 4. Lucky Low — *lowest unique number* (3–8, 5–10 min, S)
Quick filler. Each round everyone secretly picks a number from 1 to 15. The **lowest number nobody
else picked** wins the round's pot; the pot grows when no number is unique. A twist card each
round: "Highest unique wins", "Evens only", "Pot ×2". 8 rounds.

Why it fits: a 30-second-per-round game for between long ones, and a strong bot game (bots can
play simple strategies, so it's fun even at 3 players). Tiny state, tiny UI.

---

## Tier 2: new genres, medium effort

### 5. The Imposter Word (built as Odd Word Out) — *one of you has a different word* (4–8, 15 min, M)
Social deduction. Everyone gets the same secret word ("Beach"), except the imposter, who gets a
close one ("Pool"), or in hard mode no word at all. Players take turns giving **one-word clues**
(shown on the TV in order), two laps. Then everyone votes.
- Imposter caught: everyone else +2, but the imposter can steal the win by guessing the real word.
- Imposter survives: imposter +4.
- Rotates so everyone is the imposter roughly equally often.

Why it fits: hidden roles are the biggest missing genre, and this one needs no talking (good on
the TV setup) but gets better with it (good on Discord). Needs a word-pair list (`hub/imposter.json`)
and a turn-order clue phase; voting reuses Spy Grid / Bluff Club.

### 6. Hot Seat — *rank it like your friend would* (3–8, 15–20 min, M)
Each round one player is in the hot seat and sees five things to rank: "Pizza, tacos, sushi,
burgers, curry: favourite to least favourite". They drag them into order; everyone else drags
their guess of the hot seat's order.
- Points per item in the right place, +3 bonus for a perfect order.
- The hot seat scores the average, so honest, consistent people do well.

Why it fits: like Spectrum but about a person instead of a clue, and like the board game's
"ranking" mini-game grown into a full game. Needs a drag-to-order component (the ranking
mini-game's UI is a starting point) and `hub/rankings.json` lists.

### 7. Count Up (built) — *co-op, no talking, play in order* (2–8, 10 min, M, real-time)
Co-op and real-time. Each player gets a few secret numbers from 1–100. Without saying numbers,
the group has to play all of them **in rising order**: anyone can tap "play my lowest" at any
time. Play out of order: lose a life. Clear a level with lives left to get more cards next level.
A "pause hand" button (everyone raises it to stop and re-sync) gives one free reset per level.

Why it fits: the only real-time hub game, very tense, very short to teach, great on a TV. Uses
the server's 15 Hz tick; actions must be processed in arrival order (fine on one server).

### 8. Story Stitch — *write a story one line at a time* (3–8, 10–15 min, M)
Everyone starts a story from a random opener ("The wedding was going fine until…"). Each round you
get someone else's story but see **only the last line**, and add one. After N rounds the full
stories are read out on the TV, line by line, with the authors' names. Everyone votes for the best
line (+2) and the best story (+1 for each author).

Why it fits: pure laughs, no wrong answers, good for groups who find scoring games stressful.
Mostly reuse (text input, voting); the new part is the passing schedule and a slow "reading" reveal.

---

## Tier 3: bigger features that unlock several games

### 9. Doodle Relay — *draw, guess, draw, guess* (4–8, 15 min, L)
Everyone writes a prompt, then the chains rotate: draw what you read, describe what you see,
draw that, and so on. The reveal plays each chain on the TV from first prompt to last drawing.
Vote for favourite drawing and best (worst) misunderstanding.

### 10. Art Forger — *one artist doesn't know what you're drawing* (5–8, 15 min, L)
One shared canvas. Everyone draws one stroke per turn, two laps, toward a secret word, except the
forger, who only knows the category. Then vote: find the forger. The forger wins if not found, or
by guessing the word.

### 11. Quick Sketch — *draw and guess in real time* (3–8, 15–20 min, L)
Classic draw-and-guess: one artist, everyone types guesses, faster guesses score more, letter
hints appear over time. Guesses that are "close" ("cat" for "kitten") get a "so close!" whisper.

**Shared piece:** these three need a **drawing canvas** on phones (pointer events → simplified
strokes, a few colours and sizes, undo) and a compact stroke format sent through `hub:action`
(throttled batches, capped points per stroke). Build it once in `apps/web/components/hub/` and all
three become possible. Content moderation: drawings aren't stored, and the host can skip a chain.

---

## Hub features that make it feel like a real hub

These matter as much as more games:

- **Game Night playlist:** the host queues games ("Herd Mind → Spy Grid → Bluff Club"), and the room
  keeps a **night scoreboard** across them (1st place in a game = 3 night points, 2nd = 2, 3rd = 1).
  Crown the night's winner at the end. The room already keeps players between games, so this is
  mostly lobby + a small `room.night` record.
- **Hub page filters:** by player count ("we are 3"), length (under 15 min), and type (co-op, teams,
  drawing, about-friends). The catalog already has `players`, `minutes` and `tags`.
- **"Pick for us"** button: a random game that fits the current lobby size.
- **Per-game achievements and records** on profiles (Spy Grid: "won without a single wrong word";
  Herd Mind: "never the Lone Sheep"), using the existing per-game stats table.
- **Friend-group stats:** "you and Sam match 78% of the time" (Herd Mind, Hot Seat, Who Wrote That?
  and the board game's questions all produce this data).
- **Custom content per game:** the saved custom questions idea extended to Herd Mind prompts, Bluff
  Club prompts, Spy Grid word lists and Imposter word pairs (inside jokes make these games great).

---

## Suggested build order

1. **Herd Mind** and **Who Wrote That?**: smallest, fit the theme best, mostly reuse Bluff Club.
2. **Game Night playlist** + hub filters: makes 6 games feel like one hub.
3. **Clue Crew** (first co-op) and **The Imposter Word** (first hidden role).
4. **Hot Seat**, **Lucky Low**, **Story Stitch**, **Count Up**.
5. **Drawing canvas**, then Doodle Relay → Art Forger → Quick Sketch.

Each new game needs: `hub/games/<id>.ts`, a line in `HubGameId`, `registry.ts`, `catalog.ts`
(name, icon, colour, tutorial), a `HubSettings` entry, content in `packages/content/data/hub/`, a
view in `HubGameScreen.tsx`, bot logic and tests in `packages/shared/test/hub.test.ts`.
