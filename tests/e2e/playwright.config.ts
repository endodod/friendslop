import { defineConfig } from "@playwright/test";

/**
 * Smoke test: create room → 2 players join → play one full turn.
 * Starts the game server and the web app unless they're already running (local dev).
 */
export default defineConfig({
  testDir: ".",
  timeout: 180_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:3000", viewport: { width: 390, height: 844 } },
  webServer: [
    {
      command: "pnpm --filter @party-game/server start",
      url: "http://localhost:4000/health",
      reuseExistingServer: true,
      cwd: "../..",
      timeout: 60_000,
    },
    {
      command: "pnpm --filter @party-game/web dev",
      url: "http://localhost:3000",
      reuseExistingServer: true,
      cwd: "../..",
      timeout: 120_000,
    },
  ],
});
