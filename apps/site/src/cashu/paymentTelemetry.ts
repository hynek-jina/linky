import type { UnsignedEvent } from "nostr-tools";
import { nip19 } from "nostr-tools";
import { publishSiteWrappedEvent } from "./nostrGiftWrap";

type PaymentTelemetryMethod =
  | "cashu_chat"
  | "cashu_receive"
  | "cashu_restore"
  | "lightning_address"
  | "lightning_invoice"
  | "unknown";

type PaymentTelemetryPhase =
  | "complete"
  | "invoice_fetch"
  | "melt"
  | "publish"
  | "receive"
  | "restore"
  | "swap"
  | "unknown";

interface LocalPaymentTelemetryEvent {
  amountBucket: string | null;
  appVersion: string;
  attemptCount: number;
  createdAtSec: number;
  direction: "in" | "out";
  errorCode: string | null;
  errorDetail: string | null;
  feeBucket: string | null;
  id: string;
  lastAttemptAtSec: number | null;
  method: PaymentTelemetryMethod;
  mint: string | null;
  nextAttemptAtSec: number;
  phase: PaymentTelemetryPhase;
  platform: "android" | "ios" | "web";
  status: "ok" | "error";
}

interface QueuePaymentTelemetryArgs {
  amount?: number | null;
  direction: "in" | "out";
  error?: string | null;
  fee?: number | null;
  method: PaymentTelemetryMethod;
  mint?: string | null;
  phase: PaymentTelemetryPhase;
  status: "ok" | "error";
}

const PAYMENT_ANALYTICS_RECIPIENT_NPUB =
  "npub1xuxvcnmw4drf8duzalvalxrfxjvwtrjdmwxy0ez2e62uje4drrvqu6pz2w";
const LOCAL_PENDING_PAYMENT_TELEMETRY_STORAGE_KEY =
  "linky.site.pendingPaymentTelemetry.v1";
const PAYMENT_TELEMETRY_KIND = 24134;
const PAYMENT_TELEMETRY_VALUE = "payment_telemetry";
const MAX_QUEUE_ITEMS = 250;
const MAX_ITEMS_PER_FLUSH = 10;
const AMOUNT_BUCKETS = [1, 10, 100, 1_000, 10_000, 100_000];
const FEE_BUCKETS = [1, 5, 10, 25, 100, 500];

let flushPromise: Promise<void> | null = null;

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const makeLocalId = (): string => {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `site-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const clampBucket = (value: number, buckets: readonly number[]): string => {
  for (const bucket of buckets) {
    if (value <= bucket) {
      return `lte_${bucket}`;
    }
  }

  const lastBucket = buckets.at(-1);
  return lastBucket ? `gt_${lastBucket}` : "unknown";
};

const bucketPositiveNumber = (
  value: number | null | undefined,
  buckets: readonly number[],
): string | null => {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  return clampBucket(Math.floor(value), buckets);
};

const normalizeMintUrl = (value: string | null | undefined): string | null => {
  const normalized = String(value ?? "")
    .trim()
    .replace(/\/+$/, "");
  return normalized ? normalized.slice(0, 500) : null;
};

const normalizePaymentTelemetryErrorDetail = (
  value: string | null | undefined,
): string | null => {
  const text = String(value ?? "").trim();
  if (!text) return null;
  return text.slice(0, 500);
};

const classifyPaymentErrorCode = (
  value: string | null | undefined,
): string | null => {
  const text = String(value ?? "")
    .trim()
    .toLowerCase();
  if (!text) return null;
  if (
    text.includes("short keyset id v2") ||
    text.includes("got no keysets to map it to") ||
    text.includes("couldn't map short keyset id")
  ) {
    return "short_keyset_id_unmapped";
  }
  if (text.includes("offline")) return "offline";
  if (text.includes("timeout") || text.includes("timed out")) {
    return "timeout";
  }
  if (text.includes("insufficient")) return "insufficient";
  if (text.includes("duplicate")) return "duplicate";
  if (text.includes("already signed")) return "outputs_already_signed";
  if (text.includes("publish")) return "publish_failed";
  if (text.includes("invoice")) return "invoice_failed";
  if (text.includes("mint")) return "mint_failed";
  if (text.includes("lnurl")) return "lnurl_failed";
  if (text.includes("network") || text.includes("fetch")) return "network";
  if (text.includes("invalid amount")) return "invalid_amount";
  return "unknown";
};

const getPaymentTelemetryRetryDelaySec = (attemptCount: number): number => {
  const safeAttempts =
    Number.isFinite(attemptCount) && attemptCount > 0
      ? Math.min(Math.floor(attemptCount), 6)
      : 0;
  const baseDelay = 15 * 2 ** safeAttempts;
  const jitter = Math.floor(Math.random() * 10);
  return baseDelay + jitter;
};

const isTelemetryDirection = (value: unknown): value is "in" | "out" => {
  return value === "in" || value === "out";
};

const isTelemetryStatus = (value: unknown): value is "ok" | "error" => {
  return value === "ok" || value === "error";
};

const isTelemetryMethod = (value: unknown): value is PaymentTelemetryMethod => {
  return (
    value === "cashu_chat" ||
    value === "cashu_receive" ||
    value === "cashu_restore" ||
    value === "lightning_address" ||
    value === "lightning_invoice" ||
    value === "unknown"
  );
};

const isTelemetryPhase = (value: unknown): value is PaymentTelemetryPhase => {
  return (
    value === "complete" ||
    value === "invoice_fetch" ||
    value === "melt" ||
    value === "publish" ||
    value === "receive" ||
    value === "restore" ||
    value === "swap" ||
    value === "unknown"
  );
};

const isLocalPaymentTelemetryEvent = (
  value: unknown,
): value is LocalPaymentTelemetryEvent => {
  if (!isRecord(value)) return false;

  return (
    typeof value.id === "string" &&
    typeof value.createdAtSec === "number" &&
    typeof value.attemptCount === "number" &&
    (typeof value.lastAttemptAtSec === "number" ||
      value.lastAttemptAtSec === null) &&
    typeof value.nextAttemptAtSec === "number" &&
    isTelemetryDirection(value.direction) &&
    isTelemetryStatus(value.status) &&
    isTelemetryMethod(value.method) &&
    isTelemetryPhase(value.phase) &&
    value.platform === "web" &&
    typeof value.appVersion === "string" &&
    (typeof value.mint === "string" || value.mint === null) &&
    (typeof value.amountBucket === "string" || value.amountBucket === null) &&
    (typeof value.feeBucket === "string" || value.feeBucket === null) &&
    (typeof value.errorCode === "string" || value.errorCode === null) &&
    (typeof value.errorDetail === "string" || value.errorDetail === null)
  );
};

const readQueue = (): LocalPaymentTelemetryEvent[] => {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(
      LOCAL_PENDING_PAYMENT_TELEMETRY_STORAGE_KEY,
    );
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isLocalPaymentTelemetryEvent);
  } catch {
    return [];
  }
};

const writeQueue = (items: readonly LocalPaymentTelemetryEvent[]): void => {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      LOCAL_PENDING_PAYMENT_TELEMETRY_STORAGE_KEY,
      JSON.stringify(Array.from(items)),
    );
  } catch {
    // Ignore storage failures.
  }
};

const createPaymentTelemetryWrappedEvent = (args: {
  item: LocalPaymentTelemetryEvent;
}): { baseEvent: UnsignedEvent } => {
  const baseEvent: UnsignedEvent = {
    created_at: Math.ceil(Date.now() / 1e3),
    kind: PAYMENT_TELEMETRY_KIND,
    pubkey: "",
    tags: [
      ["p", ""],
      ["client", args.item.id],
      ["linky", PAYMENT_TELEMETRY_VALUE],
    ],
    content: JSON.stringify({
      v: 1,
      id: args.item.id,
      createdAtSec: args.item.createdAtSec,
      direction: args.item.direction,
      status: args.item.status,
      method: args.item.method,
      phase: args.item.phase,
      mint: args.item.mint,
      amountBucket: args.item.amountBucket,
      feeBucket: args.item.feeBucket,
      errorCode: args.item.errorCode,
      errorDetail: args.item.errorDetail,
      platform: args.item.platform,
      appVersion: args.item.appVersion,
    }),
  };

  return { baseEvent };
};

const createLocalPaymentTelemetryEvent = (
  args: QueuePaymentTelemetryArgs,
  createdAtSec: number,
): LocalPaymentTelemetryEvent => {
  return {
    id: makeLocalId(),
    createdAtSec,
    attemptCount: 0,
    lastAttemptAtSec: null,
    nextAttemptAtSec: createdAtSec,
    direction: args.direction,
    status: args.status,
    method: args.method,
    phase: args.phase,
    mint: normalizeMintUrl(args.mint),
    amountBucket: bucketPositiveNumber(args.amount, AMOUNT_BUCKETS),
    feeBucket: bucketPositiveNumber(args.fee, FEE_BUCKETS),
    errorCode: classifyPaymentErrorCode(args.error),
    errorDetail: normalizePaymentTelemetryErrorDetail(args.error),
    platform: "web",
    appVersion: __APP_VERSION__,
  };
};

export const queuePaymentTelemetry = (
  args: QueuePaymentTelemetryArgs,
): void => {
  const createdAtSec = Math.floor(Date.now() / 1000);
  const entry = createLocalPaymentTelemetryEvent(args, createdAtSec);
  const nextQueue = [entry, ...readQueue()].slice(0, MAX_QUEUE_ITEMS);
  writeQueue(nextQueue);
};

export const flushPaymentTelemetryQueue = async (): Promise<void> => {
  if (flushPromise) return await flushPromise;
  if (typeof window === "undefined") return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;

  flushPromise = (async () => {
    const queue = readQueue();
    if (queue.length === 0) return;

    const nowSec = Math.floor(Date.now() / 1000);
    const dueItems = queue
      .filter((item) => item.nextAttemptAtSec <= nowSec)
      .slice(0, MAX_ITEMS_PER_FLUSH);
    if (dueItems.length === 0) return;

    const decoded = nip19.decode(PAYMENT_ANALYTICS_RECIPIENT_NPUB);
    if (decoded.type !== "npub" || typeof decoded.data !== "string") {
      return;
    }

    const recipientPublicKey = decoded.data;
    const remainingById = new Map(queue.map((item) => [item.id, item]));

    for (const item of dueItems) {
      try {
        const event = createPaymentTelemetryWrappedEvent({
          item,
        });
        event.baseEvent.tags[0] = ["p", recipientPublicKey];
        await publishSiteWrappedEvent({
          baseEvent: event.baseEvent,
          errorMessage: "Failed to publish payment telemetry",
          recipientNpub: PAYMENT_ANALYTICS_RECIPIENT_NPUB,
        });
        remainingById.delete(item.id);
      } catch {
        const current = remainingById.get(item.id);
        if (!current) continue;
        const nextAttemptCount = current.attemptCount + 1;
        remainingById.set(item.id, {
          ...current,
          attemptCount: nextAttemptCount,
          lastAttemptAtSec: nowSec,
          nextAttemptAtSec:
            nowSec + getPaymentTelemetryRetryDelaySec(nextAttemptCount),
        });
      }
    }

    writeQueue(Array.from(remainingById.values()));
  })().finally(() => {
    flushPromise = null;
  });

  return await flushPromise;
};
