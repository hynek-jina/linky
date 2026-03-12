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

function responseHeaders(config: PushServiceConfig): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": config.corsOrigin,
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Content-Type": "application/json; charset=utf-8",
  };
}

function jsonResponse(
  config: PushServiceConfig,
  status: number,
  body: Record<string, unknown>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders(config),
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

function errorResponse(config: PushServiceConfig, error: unknown): Response {
  if (error instanceof RequestError) {
    return jsonResponse(config, error.status, {
      error: error.code,
      message: error.message,
    });
  }

  if (
    error instanceof RateLimitError ||
    error instanceof StorageConflictError ||
    error instanceof StorageLimitError
  ) {
    return jsonResponse(config, error.status, {
      error: error.code,
      message: error.message,
    });
  }

  console.error("[push] unhandled request error", error);
  return jsonResponse(config, 500, {
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
          headers: responseHeaders(config),
        });
      }

      if (request.method === "GET" && url.pathname === "/health") {
        return jsonResponse(config, 200, { ok: true });
      }

      if (request.method === "GET" && url.pathname === "/") {
        return new Response(`${config.buildCommitSha}\n`, {
          status: 200,
          headers: {
            "Access-Control-Allow-Origin": config.corsOrigin,
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
            "Content-Type": "text/plain; charset=utf-8",
          },
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

        return jsonResponse(config, 200, {
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
          subscription: body.subscription,
          recipientPubkeys: body.recipientPubkeys,
          consumedChallengeNonces,
          maxPubkeysPerSubscription: config.maxPubkeysPerSubscription,
          maxSubscriptionsPerPubkey: config.maxSubscriptionsPerPubkey,
          nowMs,
        });

        return jsonResponse(config, 200, {
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
          return jsonResponse(config, 200, {
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

        return jsonResponse(config, 200, {
          ok: true,
          endpoint: body.endpoint,
          removedPubkeys: result.removedPubkeys,
          removedSubscription: result.removedSubscription,
        });
      }

      return jsonResponse(config, 404, {
        error: "not_found",
        message: "Route not found",
      });
    } catch (error) {
      return errorResponse(config, error);
    }
  };
}
