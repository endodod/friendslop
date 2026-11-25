import { expect, test, type Page } from "@playwright/test";

/** Two players: create a room from the hub, pick a game, start it. */
async function setup(browser: import("@playwright/test").Browser, gameId: string) {
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  const errors: string[] = [];
  for (const p of [a, b]) p.on("pageerror", (e) => errors.push(e.message));
  await a.goto("/");
  await a.fill('input[autocomplete="nickname"]', "Alex");
  await a.getByTestId(`game-${gameId}`).click();
  await a.getByTestId("create-room").click();
  const code = (await a.getByTestId("room-code").textContent())!.trim();
  await b.goto(`/r/${code}`);
  await b.fill("input", "Sam");
  await b.click("button:has-text('Join')");
  await expect(a.getByText("Sam")).toBeVisible();
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
  await guesser.getByTestId("lock-guess").click({ timeout: 20_000 });
  await expect(giver.getByTestId("spectrum-reveal")).toBeVisible();
  expect(errors).toEqual([]);
});

test("Lobby: switch to Spy Grid, teams need 4 players", async ({ browser }) => {
  const { a, b, errors } = await setup(browser, "party");
  await a.getByTestId("game-spygrid").click();
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
