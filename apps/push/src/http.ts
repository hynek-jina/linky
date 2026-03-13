import { createHash } from "node:crypto";
import type { PushServiceConfig } from "./config";
import {
  isRecord,
  readProofAction,
  readPubkey,
  readSubscribeRequest,
  readUnsubscribeRequest,
  RequestError,
} from "./guards";
import { OwnershipVerifier } from "./ownership";
import { InMemoryRateLimiter, RateLimitError } from "./rateLimit";
import {
  PushStorage,
  StorageConflictError,
  StorageLimitError,
} from "./storage";

interface HttpHandlerDependencies {
  config: PushServiceConfig;
  storage: PushStorage;
  ownershipVerifier: OwnershipVerifier;
  rateLimiter: InMemoryRateLimiter;
}

function hashEndpoint(endpoint: string): string {
  return createHash("sha256").update(endpoint).digest("hex").slice(0, 16);
}

function resolveAllowedOrigin(
  config: PushServiceConfig,
  request: Request,
): string | null {
  if (config.corsOrigins.includes("*")) {
    return "*";
  }

  const origin = request.headers.get("origin");
  if (!origin) {
    return null;
  }

  return config.corsOrigins.includes(origin) ? origin : null;
}

function responseHeaders(
  config: PushServiceConfig,
  request: Request,
  contentType = "application/json; charset=utf-8",
): Record<string, string> {
  const allowedOrigin = resolveAllowedOrigin(config, request);
  return {
    ...(allowedOrigin ? { "Access-Control-Allow-Origin": allowedOrigin } : {}),
    ...(allowedOrigin && allowedOrigin !== "*" ? { Vary: "Origin" } : {}),
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Content-Type": contentType,
  };
}

function jsonResponse(
  config: PushServiceConfig,
  request: Request,
  status: number,
  body: Record<string, unknown>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders(config, request),
  });
}

function ipFromRequest(
  request: Request,
  server: Bun.Server<undefined>,
): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const [first] = forwarded.split(",");
    if (first && first.trim().length > 0) {
      return first.trim();
    }
  }

  return server.requestIP(request)?.address ?? "unknown";
}

async function readJsonBody(
  request: Request,
): Promise<Record<string | number | symbol, unknown>> {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    throw new RequestError(
      400,
      "invalid_json",
      "Request body must be valid JSON",
    );
  }

  if (!isRecord(json)) {
    throw new RequestError(400, "invalid_request", "Body must be an object");
  }

  return json;
}

function errorResponse(
  config: PushServiceConfig,
  request: Request,
  error: unknown,
): Response {
  if (error instanceof RequestError) {
    return jsonResponse(config, request, error.status, {
      error: error.code,
      message: error.message,
    });
  }

  if (
    error instanceof RateLimitError ||
    error instanceof StorageConflictError ||
    error instanceof StorageLimitError
  ) {
    return jsonResponse(config, request, error.status, {
      error: error.code,
      message: error.message,
    });
  }

  console.error("[push] unhandled request error", error);
  return jsonResponse(config, request, 500, {
    error: "internal_error",
    message: "Internal server error",
  });
}

export function createHttpHandler({
  config,
  storage,
  ownershipVerifier,
  rateLimiter,
}: HttpHandlerDependencies) {
  return async (
    request: Request,
    server: Bun.Server<undefined>,
  ): Promise<Response> => {
    const url = new URL(request.url);
    const nowMs = Date.now();

    try {
      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: responseHeaders(config, request),
        });
      }

      if (request.method === "GET" && url.pathname === "/health") {
        return jsonResponse(config, request, 200, { ok: true });
      }

      if (request.method === "GET" && url.pathname === "/") {
        return new Response(`${config.buildCommitSha}\n`, {
          status: 200,
          headers: responseHeaders(
            config,
            request,
            "text/plain; charset=utf-8",
          ),
        });
      }

      if (request.method === "GET" && url.pathname === "/vapid-public-key") {
        return jsonResponse(config, request, 200, {
          vapidPublicKey: config.vapidPublicKey,
        });
      }

      const ip = ipFromRequest(request, server);
      rateLimiter.prune(nowMs);

      if (request.method === "POST" && url.pathname === "/auth/challenge") {
        rateLimiter.check(
          `auth:${ip}`,
          config.authRateLimitMax,
          config.authRateLimitWindowMs,
          nowMs,
        );
        const body = await readJsonBody(request);
        const pubkey = readPubkey(body.pubkey);
        const action = readProofAction(body.action);
        const expiresAt = nowMs + config.challengeTtlMs;
        const challenge = storage.createChallenge(
          pubkey,
          action,
          expiresAt,
          nowMs,
        );
        console.info(
          `[push] challenge issued action=${action} pubkey=${pubkey} ip=${ip}`,
        );

        return jsonResponse(config, request, 200, {
          pubkey,
          action,
          challenge,
          expiresAt,
        });
      }

      if (request.method === "POST" && url.pathname === "/subscribe") {
        rateLimiter.check(
          `subscribe:${ip}`,
          config.subscribeRateLimitMax,
          config.subscribeRateLimitWindowMs,
          nowMs,
        );

        const body = readSubscribeRequest(await readJsonBody(request));
        const consumedChallengeNonces = ownershipVerifier.verifyProofs(
          "subscribe",
          body.recipientPubkeys,
          body.proofs,
          nowMs,
        );

        storage.registerSubscription({
          cleanupLegacySubscriptions: body.cleanupLegacySubscriptions,
          installationId: body.installationId,
          subscription: body.subscription,
          recipientPubkeys: body.recipientPubkeys,
          consumedChallengeNonces,
          maxPubkeysPerSubscription: config.maxPubkeysPerSubscription,
          maxSubscriptionsPerPubkey: config.maxSubscriptionsPerPubkey,
          nowMs,
        });
        console.info(
          `[push] subscribe ok endpoint=${hashEndpoint(body.subscription.endpoint)} installation=${body.installationId ?? "none"} cleanupLegacy=${body.cleanupLegacySubscriptions} pubkeys=${body.recipientPubkeys.length} ip=${ip}`,
        );

        return jsonResponse(config, request, 200, {
          ok: true,
          endpoint: body.subscription.endpoint,
          recipientPubkeys: body.recipientPubkeys,
        });
      }

      if (request.method === "POST" && url.pathname === "/unsubscribe") {
        rateLimiter.check(
          `unsubscribe:${ip}`,
          config.unsubscribeRateLimitMax,
          config.unsubscribeRateLimitWindowMs,
          nowMs,
        );

        const body = readUnsubscribeRequest(await readJsonBody(request));
        if (body.recipientPubkeys === null) {
          const removed = storage.unregisterSubscription(body.endpoint);
          console.info(
            `[push] unsubscribe endpoint=${hashEndpoint(body.endpoint)} removed=${removed} ip=${ip}`,
          );
          return jsonResponse(config, request, 200, {
            ok: true,
            removed,
            endpoint: body.endpoint,
          });
        }

        const consumedChallengeNonces = ownershipVerifier.verifyProofs(
          "unsubscribe",
          body.recipientPubkeys,
          body.proofs,
          nowMs,
        );

        const result = storage.unregisterSubscriptionPubkeys({
          endpoint: body.endpoint,
          recipientPubkeys: body.recipientPubkeys,
          consumedChallengeNonces,
          nowMs,
        });
        console.info(
          `[push] unsubscribe pubkeys endpoint=${hashEndpoint(body.endpoint)} removedPubkeys=${result.removedPubkeys} removedSubscription=${result.removedSubscription} ip=${ip}`,
        );

        return jsonResponse(config, request, 200, {
          ok: true,
          endpoint: body.endpoint,
          removedPubkeys: result.removedPubkeys,
          removedSubscription: result.removedSubscription,
        });
      }

      return jsonResponse(config, request, 404, {
        error: "not_found",
        message: "Route not found",
      });
    } catch (error) {
      return errorResponse(config, request, error);
    }
  };
}
