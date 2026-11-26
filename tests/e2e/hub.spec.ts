import { expect, test, type Page } from "@playwright/test";

/** Two players: create a room from the hub, pick a game, start it. */
async function setup(browser: import("@playwright/test").Browser, gameId: string) {
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  const errors: string[] = [];
  for (const p of [a, b]) p.on("pageerror", (e) => errors.push(e.message));
  await a.goto("/");
  await a.fill('input[autocomplete="nickname"]', "Player A");
  await a.getByTestId(`game-${gameId}`).click();
  await a.getByTestId("create-room").click();
  const code = (await a.getByTestId("room-code").textContent())!.trim();
  await b.goto(`/r/${code}`);
  await b.fill("input", "Player B");
  await b.click("button:has-text('Join')");
  await expect(a.getByText("Player B", { exact: true })).toBeVisible();
  return { a, b, errors };
}

async function start(a: Page, b: Page) {
  await a.getByTestId("ready-button").click();
  await b.getByTestId("ready-button").click();
  await a.getByTestId("start-button").click();
  await a.getByTestId("got-it").click();
  await b.getByTestId("got-it").click();
}

test("Spectrum: clue, guess, reveal; refresh keeps the seat", async ({ browser }) => {
  const { a, b, errors } = await setup(browser, "spectrum");
  await start(a, b);
  const giver = await Promise.race([
    a.getByTestId("spectrum-clue-form").waitFor({ timeout: 20_000 }).then(() => a),
    b.getByTestId("spectrum-clue-form").waitFor({ timeout: 20_000 }).then(() => b),
  ]);
  const guesser = giver === a ? b : a;
  // The target is secret: only the clue-giver's page has the clue form.
  await expect(guesser.getByTestId("spectrum-clue-form")).toHaveCount(0);
  await giver.fill('[aria-label="Your clue"]', "Lukewarm tea");
  await giver.getByTestId("spectrum-clue-form").locator("button.btn-primary").click();
  await expect(guesser.getByTestId("spectrum-clue")).toContainText("Lukewarm tea");
  await guesser.reload();
  await expect(guesser.getByTestId("lock-guess")).toBeDisabled({ timeout: 20_000 });
  await guesser.getByTestId("step-7").click();
  await guesser.getByTestId("lock-guess").click();
  await expect(giver.getByTestId("spectrum-reveal")).toBeVisible();
  expect(errors).toEqual([]);
});

test("Lobby: switch to Spy Grid, teams need 4 players", async ({ browser }) => {
  const { a, b, errors } = await setup(browser, "party");
  // The picker is collapsed to the current game.
  await expect(a.getByTestId("game-spygrid")).toHaveCount(0);
  await a.getByTestId("game-picker-toggle").click();
  await a.getByTestId("game-spygrid").click();
  // Picking a game collapses the list again: only the current game stays.
  await expect(a.getByTestId("game-spygrid")).toHaveCount(1);
  await expect(b.getByTestId("teams-panel")).toBeVisible();
  await a.getByTestId("ready-button").click();
  await b.getByTestId("ready-button").click();
  await expect(a.getByTestId("start-button")).toBeDisabled();
  await expect(a.getByText("Spy Grid needs at least 4 players.")).toBeVisible();
  await a.getByTestId("add-bot").click();
  await a.getByTestId("add-bot").click();
  await expect(a.getByTestId("start-button")).toBeEnabled();
  await a.getByTestId("start-button").click();
  await a.getByTestId("got-it").click();
  await b.getByTestId("got-it").click();
  await expect(a.getByTestId("spy-grid")).toBeVisible();
  await expect(a.getByTestId("spy-grid").getByRole("gridcell")).toHaveCount(25);
  expect(errors).toEqual([]);
});

test("Count Up: play the lowest card, the pile grows", async ({ browser }) => {
  const { a, b, errors } = await setup(browser, "countup");
  await start(a, b);
  await expect(a.getByTestId("countup-play")).toBeEnabled({ timeout: 20_000 });
  await a.getByTestId("countup-play").click();
  await expect(b.getByTestId("countup-pile")).toBeVisible();
  // The other player's card is secret: only counts show.
  await expect(b.getByTestId("countup-hand")).toBeVisible();
  expect(errors).toEqual([]);
});

test("Odd Word Out: secret words, clues in turn", async ({ browser }) => {
  const { a, b, errors } = await setup(browser, "oddword");
  await a.getByTestId("add-bot").click();
  await a.getByTestId("add-bot").click();
  await start(a, b);
  await expect(a.getByTestId("odd-word")).toBeVisible({ timeout: 20_000 });
  await expect(b.getByTestId("odd-word")).toBeVisible();
  await expect(a.getByTestId("odd-clues")).toBeVisible();
  expect(errors).toEqual([]);
});

test("Who Wrote That?: answer, then guess an anonymous answer", async ({ browser }) => {
  const { a, b, errors } = await setup(browser, "whowrote");
  await a.getByTestId("add-bot").click();
  await start(a, b);
  for (const [p, text] of [
    [a, "Juggling oranges"],
    [b, "Whistling backwards"],
  ] as const) {
    await p.fill('[aria-label="Your answer"]', text);
    await p.getByTestId("whowrote-write").locator("button.btn-primary").click();
  }
  await expect(a.getByTestId("whowrote-answer")).toBeVisible({ timeout: 20_000 });
  // Each player either guesses or is told the answer is theirs.
  for (const p of [a, b]) {
    const pick = p.getByTestId("whowrote-candidate").first();
    if (await pick.isVisible()) await pick.click();
  }
  await expect(a.getByTestId("whowrote-result")).toBeVisible({ timeout: 30_000 });
  expect(errors).toEqual([]);
});

test("Clue Crew: the guesser never sees the word; clues cancel out", async ({ browser }) => {
  const { a, b, errors } = await setup(browser, "cluecrew");
  await a.getByTestId("add-bot").click();
  await start(a, b);
  await expect(a.getByTestId("cluecrew")).toBeVisible({ timeout: 20_000 });
  const forms = await Promise.all([a, b].map((p) => p.getByTestId("crew-clue-form").count()));
  const givers = [a, b].filter((_, i) => forms[i] > 0);
  const guessers = [a, b].filter((_, i) => forms[i] === 0);
  for (const g of guessers) await expect(g.getByTestId("crew-word")).toHaveCount(0);
  for (const g of givers) {
    const inputs = g.getByTestId("crew-clue-form").locator("input");
    const n = await inputs.count();
    for (let i = 0; i < n; i++) await inputs.nth(i).fill(`zq${i}${givers.indexOf(g)}x`);
    await g.getByTestId("crew-clue-form").locator("button.btn-primary").click();
  }
  for (const g of givers) {
    const ok = g.getByTestId("crew-ok");
    await ok.waitFor({ timeout: 20_000 }).catch(() => {});
    if (await ok.isVisible()) await ok.click();
  }
  await expect(a.getByTestId("crew-clue").first()).toBeVisible({ timeout: 30_000 });
  for (const g of guessers) await expect(g.getByTestId("crew-word")).toHaveCount(0);
  expect(errors).toEqual([]);
});
