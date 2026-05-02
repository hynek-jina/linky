import type { Event as NostrToolsEvent } from "nostr-tools";
import { getPublicKey, type UnsignedEvent } from "nostr-tools";
import {
  getTelemetryAppRuntime,
  getTelemetryDevicePlatform,
} from "../../platform/runtime";
import { normalizeMintUrl } from "../../utils/mint";
import { makeLocalId } from "../../utils/validation";
import type {
  LocalPaymentTelemetryEvent,
  LoggedPaymentEventParams,
  PaymentTelemetryMethod,
  PaymentTelemetryPhase,
  PaymentTelemetryStatus,
} from "../types/appTypes";
import {
  LINKY_PAYMENT_TELEMETRY_KIND,
  wrapEventWithoutPushMarker,
} from "./pushWrappedEvent";

const AMOUNT_BUCKETS = [1, 10, 100, 1_000, 10_000, 100_000];
const FEE_BUCKETS = [1, 5, 10, 25, 100, 500];

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

const asTelemetryMethod = (
  value: LoggedPaymentEventParams["method"],
): PaymentTelemetryMethod => {
  switch (value) {
    case "cashu_chat":
    case "cashu_receive":
    case "cashu_restore":
    case "lightning_address":
    case "lightning_invoice":
      return value;
    default:
      return "unknown";
  }
};

const asTelemetryPhase = (
  value: LoggedPaymentEventParams["phase"],
): PaymentTelemetryPhase => {
  switch (value) {
    case "complete":
    case "invoice_fetch":
    case "melt":
    case "publish":
    case "receive":
    case "restore":
    case "swap":
      return value;
    default:
      return "unknown";
  }
};

export const normalizePaymentTelemetryErrorDetail = (
  value: string | null | undefined,
): string | null => {
  const text = String(value ?? "").trim();
  if (!text) return null;
  return text.slice(0, 500);
};

export const normalizePaymentTelemetryMint = (
  value: string | null | undefined,
): string | null => {
  const normalized = normalizeMintUrl(value);
  if (!normalized) return null;
  return normalized.slice(0, 500);
};

export const classifyPaymentErrorCode = (
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
  if (text.includes("timeout") || text.includes("timed out")) return "timeout";
  if (text.includes("insufficient")) return "insufficient";
  if (text.includes("duplicate")) return "duplicate";
  if (text.includes("already signed")) return "outputs_already_signed";
  if (text.includes("publish")) return "publish_failed";
  if (text.includes("invoice")) return "invoice_failed";
  if (text.includes("mint")) return "mint_failed";
  if (text.includes("lnurl")) return "lnurl_failed";
  if (text.includes("network") || text.includes("fetch")) return "network";
  if (text.includes("invalid npub")) return "invalid_npub";
  if (text.includes("invalid nsec")) return "invalid_nsec";
  if (text.includes("invalid amount")) return "invalid_amount";
  return "unknown";
};

const isDeclinedPaymentErrorCode = (value: string | null): boolean => {
  return value === "insufficient" || value === "invalid_amount";
};

export const normalizePaymentTelemetryStatus = (args: {
  error: string | null | undefined;
  status: PaymentTelemetryStatus;
}): PaymentTelemetryStatus => {
  if (args.status === "ok" || args.status === "declined") {
    return args.status;
  }

  const errorCode = classifyPaymentErrorCode(args.error);
  return isDeclinedPaymentErrorCode(errorCode) ? "declined" : "error";
};

export const createLocalPaymentTelemetryEvent = (
  event: LoggedPaymentEventParams,
  createdAtSec: number,
): LocalPaymentTelemetryEvent => {
  const errorCode = classifyPaymentErrorCode(event.error);

  return {
    id: makeLocalId(),
    createdAtSec,
    attemptCount: 0,
    lastAttemptAtSec: null,
    nextAttemptAtSec: createdAtSec,
    direction: event.direction,
    status: normalizePaymentTelemetryStatus({
      error: event.error,
      status: event.status,
    }),
    method: asTelemetryMethod(event.method),
    phase: asTelemetryPhase(event.phase),
    mint: normalizePaymentTelemetryMint(event.mint),
    amountBucket: bucketPositiveNumber(event.amount, AMOUNT_BUCKETS),
    feeBucket: bucketPositiveNumber(event.fee, FEE_BUCKETS),
    errorCode,
    errorDetail: normalizePaymentTelemetryErrorDetail(event.error),
    devicePlatform: getTelemetryDevicePlatform(),
    appRuntime: getTelemetryAppRuntime(),
    appVersion: __APP_VERSION__,
  };
};

export const getPaymentTelemetryRetryDelaySec = (
  attemptCount: number,
): number => {
  const safeAttempts =
    Number.isFinite(attemptCount) && attemptCount > 0
      ? Math.min(Math.floor(attemptCount), 6)
      : 0;
  const baseDelay = 15 * 2 ** safeAttempts;
  const jitter = Math.floor(Math.random() * 10);
  return baseDelay + jitter;
};

export const createPaymentTelemetryWrappedEvent = (args: {
  item: LocalPaymentTelemetryEvent;
  recipientPublicKey: string;
  senderPrivateKey: Uint8Array;
}): NostrToolsEvent => {
  const senderPublicKey = getPublicKey(args.senderPrivateKey);
  const baseEvent: UnsignedEvent = {
    created_at: Math.ceil(Date.now() / 1e3),
    kind: LINKY_PAYMENT_TELEMETRY_KIND,
    pubkey: senderPublicKey,
    tags: [
      ["p", args.recipientPublicKey],
      ["client", args.item.id],
      ["linky", "payment_telemetry"],
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
      devicePlatform: args.item.devicePlatform ?? null,
      appRuntime: args.item.appRuntime ?? null,
      appVersion: args.item.appVersion,
    }),
  };

  return wrapEventWithoutPushMarker(
    baseEvent,
    args.senderPrivateKey,
    args.recipientPublicKey,
  );
};
