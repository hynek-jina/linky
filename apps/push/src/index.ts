import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";

import { loadConfig } from "./config.ts";
import { createHttpHandler } from "./http.ts";
import { OwnershipVerifier } from "./ownership.ts";
import { PushDeliveryService } from "./push.ts";
import { InMemoryRateLimiter } from "./rateLimit.ts";
import { RelayWatcher } from "./relayWatcher.ts";
import { PushStorage } from "./storage.ts";

const config = loadConfig(process.env);
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
  relayWatcher.pruneSeen(nowMs);
  rateLimiter.prune(nowMs);
}, 60 * 1000);

const handleRequest = createHttpHandler({
  config,
  storage,
  ownershipVerifier,
  rateLimiter,
  pushDelivery,
});

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolveBody, rejectBody) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolveBody(Buffer.concat(chunks)));
    req.on("error", rejectBody);
  });
}

function toFetchRequest(req: IncomingMessage, body: Buffer): Request {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (typeof value === "string") {
      headers.set(name, value);
    } else if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(name, item);
      }
    }
  }

  const method = req.method ?? "GET";
  const init: RequestInit = { method, headers };
  if (method !== "GET" && method !== "HEAD") {
    init.body = body;
  }

  return new Request(
    `http://${req.headers.host ?? "localhost"}${req.url ?? "/"}`,
    init,
  );
}

async function serveRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const body = await readBody(req);
    const request = toFetchRequest(req, body);
    const response = await handleRequest(
      request,
      req.socket.remoteAddress ?? null,
    );

    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, name) => {
      responseHeaders[name] = value;
    });
    res.writeHead(response.status, responseHeaders);
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    console.error("[push] server error", error);
    if (!res.headersSent) {
      res.writeHead(500, {
        "Access-Control-Allow-Origin": defaultCorsOrigin,
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Content-Type": "application/json; charset=utf-8",
      });
    }
    res.end(
      JSON.stringify({
        error: "internal_error",
        message: "Internal server error",
      }),
    );
  }
}

const server = createServer((req, res) => {
  void serveRequest(req, res);
});
server.listen(config.port);

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
  server.closeAllConnections();
  server.close();
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

console.info(
  `[push] listening on http://localhost:${config.port} with relays ${config.defaultRelays.join(", ")}`,
);
