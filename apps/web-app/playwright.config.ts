import { defineConfig } from "@playwright/test";

const PROXY_PAYMENT_SPEC = "**/proxy-payment.spec.ts";

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
      testIgnore: PROXY_PAYMENT_SPEC,
      use: { baseURL: "http://127.0.0.1:5174" },
    },
    {
      // The proxy-payment E2E runs against the local docker stack
      // (docker-compose.dev.yml: nostr relay :7777, evolu relay :4001, FakeWallet
      // mint :3338) with the app served as a production build on :5176.
      // There is deliberately no webServer here — compose owns the app. Start it with:
      //   docker compose -f docker-compose.dev.yml --profile e2e up -d --build --wait
      name: "local-stack",
      testMatch: PROXY_PAYMENT_SPEC,
      // Three cold app boots plus a full offer state machine.
      timeout: 600_000,
      // Nothing touches a relay for the first ~2.5-8s: useEvoluNostrBootstrapReady
      // gates inbox sync, status prefetch and the relay domain behind
      // minWait 2500 / quietWindow 500 / maxWait 8000, and the quiet window restarts
      // on every Evolu snapshot change. fetchNostrGeneralStatus then has its own 8s
      // maxWait. The default 5s expect timeout would land inside that window.
      expect: { timeout: 20_000 },
      use: {
        baseURL: "http://localhost:5176",
        trace: "on",
        screenshot: "only-on-failure",
      },
    },
  ],
  webServer: [
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
