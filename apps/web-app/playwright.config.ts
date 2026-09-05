import { defineConfig } from "@playwright/test";

const LOCAL_STACK_SPECS = [
  "**/boot-recovery.spec.ts",
  "**/appshell-parity.spec.ts",
  "**/owner-lanes.spec.ts",
  "**/private-attachments.spec.ts",
  "**/chat-payment-request.spec.ts",
  "**/chat-recovery.spec.ts",
  "**/evolu-sync.spec.ts",
  "**/evolu-quota-recovery.spec.ts",
  "**/cashu-sync.spec.ts",
  "**/proxy-payment.spec.ts",
  "**/linkshu-migration.spec.ts",
  "**/password-manager-save.spec.ts",
];

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  timeout: 120000,
  use: {
    headless: true,
  },
  reporter: [["list"], ["html", { open: "never" }]],
  projects: [
    {
      // The original suite: a Vite dev server in `prod-services` mode, talking to
      // the real public relays and mints.
      name: "prod-services",
      testIgnore: LOCAL_STACK_SPECS,
      use: { baseURL: "http://127.0.0.1:5174" },
    },
    {
      // Runs against the local docker stack with the app served as a
      // production build on :5176. Deliberately no webServer — compose owns
      // the app; start it with:
      //   docker compose -f docker-compose.dev.yml --profile e2e up -d --build --wait
      name: "local-stack",
      testMatch: LOCAL_STACK_SPECS,
      // Three cold app boots plus a full offer state machine.
      timeout: 600_000,
      // The app deliberately does nothing relay-facing for the first ~2.5-8s
      // (useEvoluNostrBootstrapReady), so the default 5s expect timeout can
      // expire inside that quiet window.
      expect: { timeout: 20_000 },
      use: {
        baseURL: "http://localhost:5176",
        trace: "on",
        screenshot: "only-on-failure",
      },
    },
  ],
  // Playwright boots every webServer entry regardless of --project; CI sets
  // E2E_SKIP_WEBSERVER when it only runs `local-stack` (compose owns that app).
  webServer: process.env.E2E_SKIP_WEBSERVER
    ? []
    : [
        {
          command:
            "bun run dev -- --mode prod-services --host 127.0.0.1 --port 5174",
          url: "http://127.0.0.1:5174",
          // Unconditional reuse would silently accept a stale server left running in
          // the wrong vite mode.
          reuseExistingServer: !process.env.CI,
          timeout: 120000,
        },
      ],
});
