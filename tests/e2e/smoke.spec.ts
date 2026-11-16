import { expect, test, type Page } from "@playwright/test";

/** Collect raw socket frames a page receives (to check nothing leaks before the reveal). */
function recordFrames(page: Page): string[] {
  const frames: string[] = [];
  page.on("websocket", (ws) => ws.on("framereceived", (f) => typeof f.payload === "string" && frames.push(f.payload)));
  return frames;
}

/** Do whatever the current screen asks of this player. Returns true if it acted. */
async function act(page: Page, opts: { roll?: boolean } = {}): Promise<boolean> {
  const tryClick = async (sel: string) => {
    const l = page.locator(sel).first();
    if ((await l.count()) && (await l.isVisible().catch(() => false)) && (await l.isEnabled().catch(() => false))) {
      await l.click().catch(() => {});
      return true;
    }
    return false;
  };
  if (await tryClick('[data-testid="got-it"]')) return true;
  if (opts.roll !== false && (await tryClick('[data-testid="roll-button"]'))) return true;
  const lock = page.locator('[data-testid="lock-in"]');
  if (await lock.count()) {
    if (!(await lock.isEnabled())) await tryClick('[data-testid="question-view"] button[aria-pressed]');
    return tryClick('[data-testid="lock-in"]');
  }
  if (await tryClick('[data-testid="junction"] button.btn-secondary')) return true;
  if (await tryClick('[data-testid="star"] button.btn-secondary')) return true;
  if (await tryClick('[data-testid="shop"] >> text=/Done shopping|Keep walking/')) return true;
  if (await tryClick('[data-testid="duel-pick"] button.btn-secondary')) return true;
  return false;
}

test("create room → 2 players join → play one full turn", async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  const errors: string[] = [];
  for (const p of [a, b]) p.on("pageerror", (e) => errors.push(e.message));
  const framesB = recordFrames(b);

  // A creates the room
  await a.goto("/");
  await a.fill('input[autocomplete="nickname"]', "Alex");
  await a.click("text=Create room & play");
  const code = (await a.getByTestId("room-code").textContent())!.trim();
  expect(code).toMatch(/^[A-Z]{4}$/);

  // B joins via the link
  await b.goto(`/r/${code}`);
  await b.fill("input", "Sam");
  await b.click("button:has-text('Join')");
  await expect(a.getByText("Sam")).toBeVisible();

  // Ready + start
  await a.getByTestId("ready-button").click();
  await b.getByTestId("ready-button").click();
  await a.getByTestId("start-button").click();

  // How-to-play screen: everyone taps "Got it!"
  await a.getByTestId("got-it").click();
  await b.getByTestId("got-it").click();

  // Wait for the first turn
  const roller = await Promise.race([
    a.getByTestId("roll-button").waitFor({ timeout: 30_000 }).then(() => a),
    b.getByTestId("roll-button").waitFor({ timeout: 30_000 }).then(() => b),
  ]);
  const other = roller === a ? b : a;

  // Play the turn until the other player is up (answering anything that comes up on the way)
  await roller.getByTestId("roll-button").click();
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (await other.getByTestId("roll-button").isVisible().catch(() => false)) break;
    await act(roller, { roll: false });
    await act(other, { roll: false });
    await roller.waitForTimeout(400);
  }
  await expect(other.getByTestId("roll-button")).toBeVisible();

  // Refresh mid-game keeps the seat
  await other.reload();
  await expect(other.getByTestId("roll-button")).toBeVisible({ timeout: 20_000 });

  // No answers in public state before the reveal
  for (const f of framesB) {
    if (f.includes('"stage":"answering"')) expect(f).not.toMatch(/"answers":\{"/);
  }
  expect(errors).toEqual([]);
});
