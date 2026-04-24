import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 120000,
  use: {
    baseURL: "https://127.0.0.1:5174",
    headless: true,
    ignoreHTTPSErrors: true,
  },
  webServer: {
    command: "bun run dev -- --host 127.0.0.1 --port 5174",
    url: "https://127.0.0.1:5174",
    reuseExistingServer: true,
    timeout: 120000,
  },
});
