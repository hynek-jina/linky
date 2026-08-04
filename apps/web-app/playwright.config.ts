import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  timeout: 120000,
  use: {
    baseURL: "http://127.0.0.1:5174",
    headless: true,
  },
  webServer: {
    command: "bun run dev -- --mode prod-services --host 127.0.0.1 --port 5174",
    url: "http://127.0.0.1:5174",
    reuseExistingServer: true,
    timeout: 120000,
  },
});
