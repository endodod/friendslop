# Mini-games

Each mini-game is one folder: `src/<id>/logic.ts` (server rules, pure) + `src/<id>/Client.tsx` (UI).

## Adding a mini-game

1. **Metadata** — add an entry to `packages/content/data/minigames.json`:
   `id`, `name`, `icon`, `rules`, `controls`, `bonus` (what matching the intro question gives), `weight`.
2. **Logic** — `src/<id>/logic.ts` exporting a `MiniGameDefinition` (see `packages/shared/src/minigame/types.ts`):
   - `kind`: `soloScored` | `sharedRealtime` | `turnBased` | `questionOnly`
   - `init({ players, bonuses, seed, rng, now, services })` → state. `bonuses` are the players who matched the intro question; apply the bonus yourself.
   - `onInput` / `onSubmit` (validated with `inputSchema` / `submitSchema`), optional `tick` (called ~15×/s), `isFinished`, `onTimeout`
   - `results(state)` → placements (ties share a rank). Coins come from `GAME_CONFIG.minigame.placementCoins` unless you define `payout` (fixed amounts) or `transfers` (coins move between players).
   - `publicState` (everyone) and `privateState` (one player) — **never put secrets in `publicState`**.
3. **Client** — `src/<id>/Client.tsx`, a React component receiving `MinigameClientProps`
   (`pub`, `priv`, `seed`, `me`, `bonus`, `input()`, `submit()`, `now()`, and a `ui` kit with
   Avatar, Icon, Timer, answer inputs, the full question-round UI and sound).
4. **Register** it in `src/server.ts` and `src/client.tsx`.
5. `pnpm test` — the registry test checks content and both registries agree.

## Helpers

- `defineSoloGame` (`@party-game/shared`): everyone plays locally from the same seed and submits
  inputs; your `score()` re-computes or plausibility-checks the result (e.g. reaction times under 100 ms are rejected).
- `kit/miniRound.ts`: question rounds inside a mini-game, rendered by the shared question UI.
- `kit/questionSeries.ts`: several question rounds about rotating targets (Speed Sync, Ranking).
- `kit/hooks.tsx`: `HoldButton`, `useFrameNow`, solo status widgets. `kit/SoloShell.tsx`: auto-submit before the deadline.

## Practice mode

In the lobby, the host can open **Practice modes → Play mini-games** to start any mini-game
directly (then they cycle). Handy while building one.
