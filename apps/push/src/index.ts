import { loadConfig } from "./config";
import { createHttpHandler } from "./http";
import { OwnershipVerifier } from "./ownership";
import { PushDeliveryService } from "./push";
import { InMemoryRateLimiter } from "./rateLimit";
import { RelayWatcher } from "./relayWatcher";
import { PushStorage } from "./storage";

const config = loadConfig(Bun.env);
const defaultCorsOrigin = config.corsOrigins.includes("*")
  ? "*"
  : (config.corsOrigins[0] ?? "*");
const storage = new PushStorage(config.storagePath);
const ownershipVerifier = new OwnershipVerifier({
  proofMaxAgeSeconds: config.proofMaxAgeSeconds,
  loadChallenge: (nonce) => storage.getChallenge(nonce),
});
const rateLimiter = new InMemoryRateLimiter();
const pushDelivery = new PushDeliveryService({
  firebaseServiceAccountJson: config.firebaseServiceAccountJson,
  vapidSubject: config.vapidSubject,
  vapidPublicKey: config.vapidPublicKey,
  vapidPrivateKey: config.vapidPrivateKey,
  storage,
});
const relayWatcher = new RelayWatcher({
  relayUrls: config.defaultRelays,
  storage,
  pushDelivery,
  eventDedupeTtlMs: config.eventDedupeTtlMs,
});

relayWatcher.start();
const cleanupTimer = setInterval(() => {
  const nowMs = Date.now();
  storage.pruneChallenges(nowMs);
  storage.pruneSeenEvents(nowMs, RelayWatcher.SEEN_EVENT_RETENTION_MS);
  relayWatcher.pruneSeen(nowMs);
  rateLimiter.prune(nowMs);
}, 60 * 1000);

const server = Bun.serve({
  port: config.port,
  fetch: createHttpHandler({
    config,
    storage,
    ownershipVerifier,
    rateLimiter,
    pushDelivery,
  }),
  error(error: unknown) {
    console.error("[push] server error", error);
    return new Response(
      JSON.stringify({
        error: "internal_error",
        message: "Internal server error",
      }),
      {
        status: 500,
        headers: {
          "Access-Control-Allow-Origin": defaultCorsOrigin,
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
          "Content-Type": "application/json; charset=utf-8",
        },
      },
    );
  },
});

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  console.info(`[push] shutting down on ${signal}`);
  clearInterval(cleanupTimer);
  await relayWatcher.stop();
  storage.close();
  server.stop(true);
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

console.info(
  `[push] listening on http://localhost:${server.port} with relays ${config.defaultRelays.join(", ")}`,
);
