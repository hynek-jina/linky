import type { Event as NostrToolsEvent } from "nostr-tools";
import { appendPushDebugLog } from "../../utils/pushDebugLog";
import type { AppNostrPool } from "./nostrPool";
import { hasLinkyPushMarker } from "./pushWrappedEvent";

const DEFAULT_PUBLISH_RETRY_DELAY_MS = 1500;
const DEFAULT_PUBLISH_MAX_ATTEMPTS = 2;
const DEFAULT_PUBLISH_CONFIRM_TIMEOUT_MS = 4000;

interface ConfirmPublishByIdParams {
  confirmTimeoutMs?: number;
  ids: string[];
  pool: AppNostrPool;
  relays: string[];
}

export const confirmPublishById = async ({
  confirmTimeoutMs = DEFAULT_PUBLISH_CONFIRM_TIMEOUT_MS,
  ids,
  pool,
  relays,
}: ConfirmPublishByIdParams): Promise<boolean> => {
  const uniqueIds = ids.map((id) => String(id ?? "").trim()).filter(Boolean);
  if (uniqueIds.length === 0) return false;

  return await new Promise((resolve) => {
    let done = false;
    const timeoutId = window.setTimeout(() => {
      if (done) return;
      done = true;
      try {
        sub?.close?.("timeout");
      } catch {
        // ignore
      }
      resolve(false);
    }, confirmTimeoutMs);

    const sub = pool.subscribe(
      relays,
      { ids: uniqueIds },
      {
        onevent: () => {
          if (done) return;
          done = true;
          window.clearTimeout(timeoutId);
          try {
            sub.close?.("confirmed");
          } catch {
            // ignore
          }
          resolve(true);
        },
      },
    );
  });
};

interface PublishToRelaysWithRetryParams {
  event: NostrToolsEvent;
  maxAttempts?: number;
  pool: AppNostrPool;
  relays: string[];
  retryDelayMs?: number;
}

export const publishToRelaysWithRetry = async ({
  event,
  maxAttempts = DEFAULT_PUBLISH_MAX_ATTEMPTS,
  pool,
  relays,
  retryDelayMs = DEFAULT_PUBLISH_RETRY_DELAY_MS,
}: PublishToRelaysWithRetryParams): Promise<{
  anySuccess: boolean;
  error: string | null;
  timedOut: boolean;
}> => {
  let lastError: string | null = null;
  let timedOut = false;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const publishResults = await Promise.allSettled(
      pool.publish(relays, event),
    );
    const anySuccess = publishResults.some((r) => r.status === "fulfilled");
    if (anySuccess) return { anySuccess: true, error: null, timedOut: false };

    const rejectedReason = publishResults.find(
      (r): r is PromiseRejectedResult => r.status === "rejected",
    )?.reason;
    lastError = String(rejectedReason ?? "");
    const message = String(lastError ?? "").toLowerCase();
    const isTimeout =
      message.includes("timed out") || message.includes("timeout");
    timedOut = isTimeout;
    if (!isTimeout || attempt >= maxAttempts - 1) break;

    await new Promise((resolve) => window.setTimeout(resolve, retryDelayMs));
  }

  return { anySuccess: false, error: lastError, timedOut };
};

interface PublishSingleWrappedWithRetryParams {
  event: NostrToolsEvent;
  maxAttempts?: number;
  pool: AppNostrPool;
  relays: string[];
  retryDelayMs?: number;
}

export const publishSingleWrappedWithRetry = async ({
  event,
  maxAttempts = DEFAULT_PUBLISH_MAX_ATTEMPTS,
  pool,
  relays,
  retryDelayMs = DEFAULT_PUBLISH_RETRY_DELAY_MS,
}: PublishSingleWrappedWithRetryParams): Promise<{
  anySuccess: boolean;
  error: string | null;
}> => {
  await appendPushDebugLog("client", "publish single wrapped start", {
    eventId: String(event.id ?? "").trim() || null,
    eventKind: event.kind,
    eventPushEligible: hasLinkyPushMarker(event),
    eventPubkey: event.pubkey,
    eventRecipients: extractRecipientPubkeys(event),
    relays,
  });

  const result = await publishToRelaysWithRetry({
    event,
    maxAttempts,
    pool,
    relays,
    retryDelayMs,
  });

  await appendPushDebugLog("client", "publish single wrapped relay outcome", {
    anySuccess: result.anySuccess,
    error: result.error,
    eventId: String(event.id ?? "").trim() || null,
    timedOut: result.timedOut,
  });

  if (result.anySuccess) {
    return { anySuccess: true, error: null };
  }

  if (result.timedOut) {
    const confirmed = await confirmPublishById({
      confirmTimeoutMs: DEFAULT_PUBLISH_CONFIRM_TIMEOUT_MS,
      ids: [String(event.id ?? "").trim()],
      pool,
      relays,
    });
    await appendPushDebugLog("client", "publish single wrapped confirm check", {
      confirmed,
      eventId: String(event.id ?? "").trim() || null,
    });
    if (confirmed) {
      return { anySuccess: true, error: null };
    }
  }

  return {
    anySuccess: false,
    error: result.error,
  };
};

function extractRecipientPubkeys(event: NostrToolsEvent): string[] {
  return event.tags
    .filter((tag) => Array.isArray(tag) && tag[0] === "p")
    .map((tag) => String(tag[1] ?? "").trim())
    .filter(Boolean);
}
