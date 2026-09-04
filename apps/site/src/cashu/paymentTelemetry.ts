import type { UnsignedEvent } from "nostr-tools";
import { nip19 } from "nostr-tools";
import { isRecord } from "../isRecord";
import { makeClientId, publishSiteWrappedEvent } from "./nostrGiftWrap";

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

type PaymentTelemetryStatus = "declined" | "error" | "ok";

type PaymentTelemetryDirection = "in" | "out";

type PaymentTelemetryAppRuntime = "pwa" | "web";

type PaymentTelemetryDevicePlatform =
  | "android"
  | "iphone"
  | "ipad"
  | "linux"
  | "mac"
  | "windows"
  | "unknown";

interface LocalPaymentTelemetryEvent {
  amountBucket: string | null;
  appHost?: string | null;
  appRuntime?: PaymentTelemetryAppRuntime | null;
  appVersion: string;
  attemptCount: number;
  createdAtSec: number;
  devicePlatform?: PaymentTelemetryDevicePlatform | null;
  direction: PaymentTelemetryDirection;
  errorCode: string | null;
  errorDetail: string | null;
  feeBucket: string | null;
  id: string;
  lastAttemptAtSec: number | null;
  method: PaymentTelemetryMethod;
  mint: string | null;
  nextAttemptAtSec: number;
  phase: PaymentTelemetryPhase;
  status: PaymentTelemetryStatus;
}

interface QueuePaymentTelemetryArgs {
  amount?: number | null;
  direction: PaymentTelemetryDirection;
  error?: string | null;
  fee?: number | null;
  method: PaymentTelemetryMethod;
  mint?: string | null;
  phase: PaymentTelemetryPhase;
  status: PaymentTelemetryStatus;
}

interface PaymentTelemetryLease {
  expiresAtMs: number;
  owner: string;
}

export const PAYMENT_ANALYTICS_RECIPIENT_NPUB =
  "npub1xuxvcnmw4drf8duzalvalxrfxjvwtrjdmwxy0ez2e62uje4drrvqu6pz2w";
const LOCAL_PENDING_PAYMENT_TELEMETRY_STORAGE_KEY =
  "linky.site.pendingPaymentTelemetry.v1";
const LOCAL_PENDING_PAYMENT_TELEMETRY_LOCK_STORAGE_KEY =
  "linky.site.pendingPaymentTelemetryLock.v1";
const PAYMENT_TELEMETRY_KIND = 24134;
const PAYMENT_TELEMETRY_VALUE = "payment_telemetry";
const MAX_QUEUE_ITEMS = 250;
const MAX_ITEMS_PER_FLUSH = 10;
const PAYMENT_TELEMETRY_LEASE_TTL_MS = 15_000;
const AMOUNT_BUCKETS = [1, 10, 100, 1_000, 10_000, 100_000];
const FEE_BUCKETS = [1, 5, 10, 25, 100, 500];

let flushPromise: Promise<void> | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

const getLowercaseUserAgent = (): string => {
  if (typeof navigator === "undefined") {
    return "";
  }

  return navigator.userAgent.toLowerCase();
};

const getNavigatorStandalone = (): boolean => {
  if (typeof navigator === "undefined") {
    return false;
  }

  const standalone = Reflect.get(navigator, "standalone");
  return standalone === true;
};

const getNavigatorMaxTouchPoints = (): number => {
  if (typeof navigator === "undefined") {
    return 0;
  }

  return typeof navigator.maxTouchPoints === "number"
    ? navigator.maxTouchPoints
    : 0;
};

const getTelemetryAppHost = (): string | null => {
  if (typeof window === "undefined") {
    return null;
  }

  const host = window.location.host.trim().toLowerCase();

  return host ? host.slice(0, 255) : null;
};

const getTelemetryAppRuntime = (): PaymentTelemetryAppRuntime => {
  if (typeof window !== "undefined") {
    try {
      if (window.matchMedia("(display-mode: standalone)").matches) {
        return "pwa";
      }
    } catch {
      // ignore
    }
  }

  if (getNavigatorStandalone()) {
    return "pwa";
  }

  return "web";
};

const getTelemetryDevicePlatform = (): PaymentTelemetryDevicePlatform => {
  const userAgent = getLowercaseUserAgent();
  const maxTouchPoints = getNavigatorMaxTouchPoints();

  if (userAgent.includes("android")) {
    return "android";
  }

  if (userAgent.includes("iphone") || userAgent.includes("ipod")) {
    return "iphone";
  }

  if (userAgent.includes("ipad")) {
    return "ipad";
  }

  if (userAgent.includes("macintosh") && maxTouchPoints > 1) {
    return "ipad";
  }

  if (userAgent.includes("macintosh") || userAgent.includes("mac os x")) {
    return "mac";
  }

  if (userAgent.includes("windows")) {
    return "windows";
  }

  if (userAgent.includes("linux") || userAgent.includes("x11")) {
    return "linux";
  }

  return "unknown";
};

const isPaymentTelemetryLease = (
  value: unknown,
): value is PaymentTelemetryLease => {
  if (!isRecord(value)) return false;
  return (
    typeof value.owner === "string" && typeof value.expiresAtMs === "number"
  );
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
  const normalized = (value ?? "").trim().replace(/\/+$/, "");
  return normalized ? normalized.slice(0, 500) : null;
};

const normalizePaymentTelemetryErrorDetail = (
  value: string | null | undefined,
): string | null => {
  const text = (value ?? "").trim();
  if (!text) return null;
  return text.slice(0, 500);
};

const classifyPaymentErrorCode = (
  value: string | null | undefined,
): string | null => {
  const text = (value ?? "").trim().toLowerCase();
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

const isDeclinedPaymentErrorCode = (value: string | null): boolean => {
  return value === "insufficient" || value === "invalid_amount";
};

const normalizePaymentTelemetryStatus = (args: {
  error: string | null | undefined;
  status: PaymentTelemetryStatus;
}): PaymentTelemetryStatus => {
  if (args.status === "ok" || args.status === "declined") {
    return args.status;
  }

  const errorCode = classifyPaymentErrorCode(args.error);
  return isDeclinedPaymentErrorCode(errorCode) ? "declined" : "error";
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

const isOneOf = <T extends string>(values: readonly T[]) => {
  return (value: unknown): value is T => {
    return values.some((candidate) => candidate === value);
  };
};

const isTelemetryDirection = isOneOf<PaymentTelemetryDirection>(["in", "out"]);
const isTelemetryStatus = isOneOf<PaymentTelemetryStatus>([
  "declined",
  "error",
  "ok",
]);
const isTelemetryMethod = isOneOf<PaymentTelemetryMethod>([
  "cashu_chat",
  "cashu_receive",
  "cashu_restore",
  "lightning_address",
  "lightning_invoice",
  "unknown",
]);
const isTelemetryPhase = isOneOf<PaymentTelemetryPhase>([
  "complete",
  "invoice_fetch",
  "melt",
  "publish",
  "receive",
  "restore",
  "swap",
  "unknown",
]);
const isTelemetryAppRuntime = isOneOf<PaymentTelemetryAppRuntime>([
  "pwa",
  "web",
]);
const isTelemetryDevicePlatform = isOneOf<PaymentTelemetryDevicePlatform>([
  "android",
  "iphone",
  "ipad",
  "linux",
  "mac",
  "windows",
  "unknown",
]);

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
    typeof value.appVersion === "string" &&
    (typeof value.appHost === "undefined" ||
      value.appHost === null ||
      typeof value.appHost === "string") &&
    (typeof value.appRuntime === "undefined" ||
      value.appRuntime === null ||
      isTelemetryAppRuntime(value.appRuntime)) &&
    (typeof value.mint === "string" || value.mint === null) &&
    (typeof value.amountBucket === "string" || value.amountBucket === null) &&
    (typeof value.devicePlatform === "undefined" ||
      value.devicePlatform === null ||
      isTelemetryDevicePlatform(value.devicePlatform)) &&
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

const readPaymentTelemetryLease = (): PaymentTelemetryLease | null => {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(
      LOCAL_PENDING_PAYMENT_TELEMETRY_LOCK_STORAGE_KEY,
    );
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isPaymentTelemetryLease(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const writePaymentTelemetryLease = (lease: PaymentTelemetryLease): void => {
  try {
    window.localStorage.setItem(
      LOCAL_PENDING_PAYMENT_TELEMETRY_LOCK_STORAGE_KEY,
      JSON.stringify(lease),
    );
  } catch {
    // Ignore storage failures.
  }
};

const removePaymentTelemetryLease = (owner: string): void => {
  try {
    if (readPaymentTelemetryLease()?.owner === owner) {
      window.localStorage.removeItem(
        LOCAL_PENDING_PAYMENT_TELEMETRY_LOCK_STORAGE_KEY,
      );
    }
  } catch {
    // Ignore storage failures.
  }
};

const withPaymentTelemetryLease = async (
  run: () => Promise<void>,
): Promise<boolean> => {
  const nowMs = Date.now();
  const current = readPaymentTelemetryLease();
  if (current && current.expiresAtMs > nowMs) {
    return false;
  }

  const owner = makeClientId();
  writePaymentTelemetryLease({
    expiresAtMs: nowMs + PAYMENT_TELEMETRY_LEASE_TTL_MS,
    owner,
  });
  if (readPaymentTelemetryLease()?.owner !== owner) {
    return false;
  }

  const heartbeat = window.setInterval(
    () => {
      if (readPaymentTelemetryLease()?.owner !== owner) return;
      writePaymentTelemetryLease({
        expiresAtMs: Date.now() + PAYMENT_TELEMETRY_LEASE_TTL_MS,
        owner,
      });
    },
    Math.floor(PAYMENT_TELEMETRY_LEASE_TTL_MS / 3),
  );

  try {
    await run();
    return true;
  } finally {
    window.clearInterval(heartbeat);
    removePaymentTelemetryLease(owner);
  }
};

const schedulePaymentTelemetryFlush = (minimumDelayMs = 0): void => {
  if (typeof window === "undefined") return;
  if (flushTimer !== null) {
    window.clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;

  const queue = readQueue();
  if (queue.length === 0) return;

  const nextAttemptAtSec = Math.min(
    ...queue.map((item) => item.nextAttemptAtSec),
  );
  const delayMs = Math.max(
    minimumDelayMs,
    nextAttemptAtSec * 1000 - Date.now(),
    0,
  );
  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    void flushPaymentTelemetryQueue();
  }, delayMs);
};

const createPaymentTelemetryBaseEvent = (
  item: LocalPaymentTelemetryEvent,
  recipientPublicKey: string,
): UnsignedEvent => {
  return {
    created_at: Math.ceil(Date.now() / 1e3),
    kind: PAYMENT_TELEMETRY_KIND,
    pubkey: "",
    tags: [
      ["p", recipientPublicKey],
      ["client", item.id],
      ["linky", PAYMENT_TELEMETRY_VALUE],
    ],
    content: JSON.stringify({
      v: 1,
      id: item.id,
      createdAtSec: item.createdAtSec,
      direction: item.direction,
      status: item.status,
      method: item.method,
      phase: item.phase,
      mint: item.mint,
      amountBucket: item.amountBucket,
      feeBucket: item.feeBucket,
      errorCode: item.errorCode,
      errorDetail: item.errorDetail,
      appHost: item.appHost ?? null,
      devicePlatform: item.devicePlatform ?? null,
      appRuntime: item.appRuntime ?? null,
      appVersion: item.appVersion,
    }),
  };
};

const createLocalPaymentTelemetryEvent = (
  args: QueuePaymentTelemetryArgs,
  createdAtSec: number,
): LocalPaymentTelemetryEvent => {
  const errorCode = classifyPaymentErrorCode(args.error);

  return {
    id: makeClientId(),
    createdAtSec,
    attemptCount: 0,
    lastAttemptAtSec: null,
    nextAttemptAtSec: createdAtSec,
    direction: args.direction,
    status: normalizePaymentTelemetryStatus({
      error: args.error,
      status: args.status,
    }),
    method: args.method,
    phase: args.phase,
    mint: normalizeMintUrl(args.mint),
    amountBucket: bucketPositiveNumber(args.amount, AMOUNT_BUCKETS),
    feeBucket: bucketPositiveNumber(args.fee, FEE_BUCKETS),
    errorCode,
    errorDetail: normalizePaymentTelemetryErrorDetail(args.error),
    appHost: getTelemetryAppHost(),
    devicePlatform: getTelemetryDevicePlatform(),
    appRuntime: getTelemetryAppRuntime(),
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
  schedulePaymentTelemetryFlush();
};

export const flushPaymentTelemetryQueue = async (): Promise<void> => {
  if (flushPromise) return await flushPromise;
  if (typeof window === "undefined") return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;

  let nextMinimumDelayMs = 0;
  flushPromise = (async () => {
    const acquired = await withPaymentTelemetryLease(async () => {
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
      const publishedIds = new Set<string>();
      const retryById = new Map<string, LocalPaymentTelemetryEvent>();

      for (const item of dueItems) {
        try {
          await publishSiteWrappedEvent({
            baseEvent: createPaymentTelemetryBaseEvent(
              item,
              recipientPublicKey,
            ),
            errorMessage: "Failed to publish payment telemetry",
            recipientNpub: PAYMENT_ANALYTICS_RECIPIENT_NPUB,
          });
          publishedIds.add(item.id);
        } catch {
          const nextAttemptCount = item.attemptCount + 1;
          retryById.set(item.id, {
            ...item,
            attemptCount: nextAttemptCount,
            lastAttemptAtSec: nowSec,
            nextAttemptAtSec:
              nowSec + getPaymentTelemetryRetryDelaySec(nextAttemptCount),
          });
        }
      }

      const nextQueue = readQueue().flatMap((item) => {
        if (publishedIds.has(item.id)) return [];
        return [retryById.get(item.id) ?? item];
      });
      writeQueue(nextQueue);
    });

    if (!acquired) {
      nextMinimumDelayMs = 1_000;
    }
  })().finally(() => {
    flushPromise = null;
    schedulePaymentTelemetryFlush(nextMinimumDelayMs);
  });

  return await flushPromise;
};
