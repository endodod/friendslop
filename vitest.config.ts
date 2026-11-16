import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.ts", "packages/*/src/**/*.test.ts", "packages/minigames/src/**/*.test.ts", "apps/server/test/**/*.test.ts"],
    environment: "node",
  },
});
