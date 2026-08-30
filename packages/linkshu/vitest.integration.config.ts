import { defineConfig } from "vitest/config";

// Runs against the local docker mint (docker-compose.dev.yml `cashu-mint`,
// Nutshell FakeWallet on :3338); bring it up before running this project.
export default defineConfig({
  test: {
    globals: true,
    include: ["tests/integration/**/*.test.ts"],
    testTimeout: 30_000,
  },
});
