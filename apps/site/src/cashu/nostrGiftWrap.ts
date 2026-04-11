import type {
  Event as NostrEvent,
  SimplePool as NostrToolsSimplePool,
  UnsignedEvent,
} from "nostr-tools";
import { generateSecretKey, getPublicKey, nip19 } from "nostr-tools";
import { wrapEvent } from "nostr-tools/nip59";

const NOSTR_RELAYS = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.0xchat.com",
];

const DEFAULT_PUBLISH_RETRY_DELAY_MS = 1500;
const DEFAULT_PUBLISH_MAX_ATTEMPTS = 2;
const DEFAULT_PUBLISH_CONFIRM_TIMEOUT_MS = 4000;

type SiteNostrPool = Pick<NostrToolsSimplePool, "publish" | "subscribe">;

let sharedPoolPromise: Promise<SiteNostrPool> | null = null;

const getSharedPool = async (): Promise<SiteNostrPool> => {
  if (sharedPoolPromise) return await sharedPoolPromise;

  sharedPoolPromise = (async () => {
    const { SimplePool } = await import("nostr-tools");
    return new SimplePool();
  })().catch((error) => {
    sharedPoolPromise = null;
    throw error;
  });

  return await sharedPoolPromise;
};

const makeClientId = (): string => {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `site-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const decodeRecipientNpub = (npub: string): string => {
  const decoded = nip19.decode(npub);
  if (decoded.type !== "npub" || typeof decoded.data !== "string") {
    throw new Error("Invalid forward recipient npub");
  }

  return decoded.data;
};

const confirmPublishById = async (args: {
  confirmTimeoutMs?: number;
  eventId: string;
  pool: SiteNostrPool;
  relays: readonly string[];
}): Promise<boolean> => {
  const eventId = String(args.eventId ?? "").trim();
  if (!eventId) return false;

  return await new Promise((resolve) => {
    let done = false;
    let subscription: { close?: (reason?: string) => void } | null = null;
    const timeoutId = window.setTimeout(() => {
      if (done) return;
      done = true;
      try {
        subscription?.close?.("timeout");
      } catch {
        // ignore close failures
      }
      resolve(false);
    }, args.confirmTimeoutMs ?? DEFAULT_PUBLISH_CONFIRM_TIMEOUT_MS);

    subscription = args.pool.subscribe(
      [...args.relays],
      { ids: [eventId] },
      {
        onevent: () => {
          if (done) return;
          done = true;
          window.clearTimeout(timeoutId);
          try {
            subscription?.close?.("confirmed");
          } catch {
            // ignore close failures
          }
          resolve(true);
        },
      },
    );
  });
};

const publishWithRetry = async (args: {
  event: NostrEvent;
  maxAttempts?: number;
  pool: SiteNostrPool;
  relays: readonly string[];
  retryDelayMs?: number;
}): Promise<{
  anySuccess: boolean;
  error: string | null;
  timedOut: boolean;
}> => {
  const maxAttempts = args.maxAttempts ?? DEFAULT_PUBLISH_MAX_ATTEMPTS;
  let lastError: string | null = null;
  let timedOut = false;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const results = await Promise.allSettled(
      args.pool.publish([...args.relays], args.event),
    );
    const anySuccess = results.some((result) => result.status === "fulfilled");
    if (anySuccess) {
      return { anySuccess: true, error: null, timedOut: false };
    }

    const rejected = results.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    lastError = String(rejected?.reason ?? "");
    const normalized = lastError.toLowerCase();
    timedOut =
      normalized.includes("timed out") || normalized.includes("timeout");

    if (!timedOut || attempt >= maxAttempts - 1) {
      break;
    }

    await new Promise((resolve) => {
      window.setTimeout(
        resolve,
        args.retryDelayMs ?? DEFAULT_PUBLISH_RETRY_DELAY_MS,
      );
    });
  }

  return { anySuccess: false, error: lastError, timedOut };
};

export const publishSiteWrappedEvent = async (args: {
  baseEvent: UnsignedEvent;
  errorMessage: string;
  recipientNpub: string;
}): Promise<void> => {
  const recipientPublicKey = decodeRecipientNpub(args.recipientNpub);
  const senderPrivateKey = generateSecretKey();
  const senderPublicKey = getPublicKey(senderPrivateKey);
  const baseEvent: UnsignedEvent = {
    ...args.baseEvent,
    pubkey: senderPublicKey,
  };
  const wrapped = wrapEvent(baseEvent, senderPrivateKey, recipientPublicKey);
  const pool = await getSharedPool();
  const publishResult = await publishWithRetry({
    event: wrapped,
    pool,
    relays: NOSTR_RELAYS,
  });

  if (publishResult.anySuccess) return;

  if (publishResult.timedOut) {
    const confirmed = await confirmPublishById({
      eventId: String(wrapped.id ?? ""),
      pool,
      relays: NOSTR_RELAYS,
    });
    if (confirmed) return;
  }

  throw new Error(publishResult.error || args.errorMessage);
};

export const forwardCashuTokenPrivately = async (args: {
  recipientNpub: string;
  token: string;
}): Promise<void> => {
  const token = String(args.token ?? "").trim();
  if (!token) return;

  const baseEvent: UnsignedEvent = {
    created_at: Math.ceil(Date.now() / 1000),
    kind: 14,
    pubkey: "",
    tags: [
      ["p", decodeRecipientNpub(args.recipientNpub)],
      ["client", makeClientId()],
    ],
    content: token,
  };

  await publishSiteWrappedEvent({
    baseEvent,
    errorMessage: "Failed to forward remaining token",
    recipientNpub: args.recipientNpub,
  });
};
