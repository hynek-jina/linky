import type { OwnerId } from "@evolu/common";
import {
  ClientId,
  decodeNpub,
  OutboxRef,
  PaymentTelemetryDraft,
  UnixSeconds,
} from "@linky/linkstr";
import { enqueuePaymentTelemetryAtom, useAtomSet } from "@linky/linkstr-react";
import { Exit, Schema } from "effect";
import React from "react";
import {
  LOCAL_PENDING_PAYMENT_TELEMETRY_LOCK_STORAGE_KEY_PREFIX,
  LOCAL_PENDING_PAYMENT_TELEMETRY_STORAGE_KEY_PREFIX,
  PAYMENT_ANALYTICS_RECIPIENT_NPUB,
} from "../../utils/constants";
import {
  safeLocalStorageGetJson,
  safeLocalStorageSetJson,
  withLocalStorageLeaseLock,
} from "../../utils/storage";
import type { LocalPaymentTelemetryEvent } from "../types/appTypes";

interface UseAnonymousPaymentTelemetryParams {
  appOwnerId: OwnerId | null;
  makeLocalStorageKey: (prefix: string) => string;
}

const PAYMENT_TELEMETRY_FLUSH_INTERVAL_MS = 45_000;
/** Telemetry shares the outbox's FIFO lane with chat, so it is drained in
 * small batches rather than all at once. */
const MAX_ITEMS_PER_FLUSH = 10;
const isClientId = Schema.is(ClientId);
const isUnixSeconds = Schema.is(UnixSeconds);

const isTelemetryDirection = (value: unknown): value is "in" | "out" => {
  return value === "in" || value === "out";
};

const isTelemetryStatus = (
  value: unknown,
): value is "declined" | "error" | "ok" => {
  return value === "declined" || value === "error" || value === "ok";
};

const isTelemetryMethod = (value: unknown): boolean => {
  return (
    value === "cashu_chat" ||
    value === "cashu_receive" ||
    value === "cashu_restore" ||
    value === "lightning_address" ||
    value === "lightning_invoice" ||
    value === "unknown"
  );
};

const isTelemetryPhase = (value: unknown): boolean => {
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

const isTelemetryAppRuntime = (
  value: unknown,
): value is "native" | "pwa" | "web" => {
  return value === "native" || value === "pwa" || value === "web";
};

const isTelemetryDevicePlatform = (
  value: unknown,
): value is
  | "android"
  | "iphone"
  | "ipad"
  | "linux"
  | "mac"
  | "windows"
  | "unknown" => {
  return (
    value === "android" ||
    value === "iphone" ||
    value === "ipad" ||
    value === "linux" ||
    value === "mac" ||
    value === "windows" ||
    value === "unknown"
  );
};

const isLocalPaymentTelemetryEvent = (
  value: unknown,
): value is LocalPaymentTelemetryEvent => {
  if (typeof value !== "object" || value === null) return false;

  const id = Reflect.get(value, "id");
  const createdAtSec = Reflect.get(value, "createdAtSec");
  const direction = Reflect.get(value, "direction");
  const status = Reflect.get(value, "status");
  const method = Reflect.get(value, "method");
  const phase = Reflect.get(value, "phase");
  const appVersion = Reflect.get(value, "appVersion");
  const appHost = Reflect.get(value, "appHost");
  const appRuntime = Reflect.get(value, "appRuntime");
  const amountBucket = Reflect.get(value, "amountBucket");
  const devicePlatform = Reflect.get(value, "devicePlatform");
  const feeBucket = Reflect.get(value, "feeBucket");
  const errorCode = Reflect.get(value, "errorCode");
  const errorDetail = Reflect.get(value, "errorDetail");
  const mint = Reflect.get(value, "mint");

  return (
    typeof id === "string" &&
    typeof createdAtSec === "number" &&
    isTelemetryDirection(direction) &&
    isTelemetryStatus(status) &&
    isTelemetryMethod(method) &&
    isTelemetryPhase(phase) &&
    typeof appVersion === "string" &&
    (typeof appHost === "undefined" ||
      appHost === null ||
      typeof appHost === "string") &&
    (typeof appRuntime === "undefined" ||
      appRuntime === null ||
      isTelemetryAppRuntime(appRuntime)) &&
    (typeof mint === "string" || mint === null) &&
    (typeof amountBucket === "string" || amountBucket === null) &&
    (typeof devicePlatform === "undefined" ||
      devicePlatform === null ||
      isTelemetryDevicePlatform(devicePlatform)) &&
    (typeof feeBucket === "string" || feeBucket === null) &&
    (typeof errorCode === "string" || errorCode === null) &&
    (typeof errorDetail === "string" || errorDetail === null)
  );
};

const readQueue = (storageKey: string): LocalPaymentTelemetryEvent[] => {
  const parsed = safeLocalStorageGetJson(storageKey, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isLocalPaymentTelemetryEvent);
};

const writeQueue = (
  storageKey: string,
  items: readonly LocalPaymentTelemetryEvent[],
): void => {
  safeLocalStorageSetJson(storageKey, Array.from(items));
};

const toPaymentTelemetryDraft = (
  item: LocalPaymentTelemetryEvent,
): PaymentTelemetryDraft | null => {
  if (!isClientId(item.id) || !isUnixSeconds(item.createdAtSec)) return null;
  return new PaymentTelemetryDraft({
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
  });
};

/**
 * Payment events are recorded into a per-owner localStorage buffer before the
 * linkstr runtime is necessarily ready; this hook hands them to the outbox,
 * which owns delivery and retries from that moment on.
 */
export const useAnonymousPaymentTelemetry = ({
  appOwnerId,
  makeLocalStorageKey,
}: UseAnonymousPaymentTelemetryParams): void => {
  const flushRef = React.useRef<Promise<void> | null>(null);
  const enqueuePaymentTelemetry = useAtomSet(enqueuePaymentTelemetryAtom, {
    mode: "promiseExit",
  });

  const flushQueue = React.useCallback(async () => {
    if (!appOwnerId) return;
    if (flushRef.current) return;

    const storageKey = makeLocalStorageKey(
      LOCAL_PENDING_PAYMENT_TELEMETRY_STORAGE_KEY_PREFIX,
    );
    const lockKey = makeLocalStorageKey(
      LOCAL_PENDING_PAYMENT_TELEMETRY_LOCK_STORAGE_KEY_PREFIX,
    );

    // The lock is what keeps two tabs from enqueueing the same pending item
    // twice: the outbox does not dedupe across tabs.
    const run = withLocalStorageLeaseLock({
      key: lockKey,
      fn: async () => {
        const pending = readQueue(storageKey);
        if (pending.length === 0) return;

        const recipient = decodeNpub(PAYMENT_ANALYTICS_RECIPIENT_NPUB);
        if (!recipient) return;
        const remainingById = new Map(pending.map((item) => [item.id, item]));

        for (const item of pending.slice(0, MAX_ITEMS_PER_FLUSH)) {
          const draft = toPaymentTelemetryDraft(item);
          if (draft === null) {
            remainingById.delete(item.id); // unencodable: it can never be sent
            continue;
          }

          const outcome = await enqueuePaymentTelemetry({
            draft,
            recipient,
            ref: OutboxRef.make(`telemetry:${item.id}`),
          });
          if (Exit.isSuccess(outcome)) remainingById.delete(item.id);
        }

        writeQueue(storageKey, Array.from(remainingById.values()));
      },
    }).finally(() => {
      flushRef.current = null;
    });

    flushRef.current = run;
    await run;
  }, [appOwnerId, makeLocalStorageKey, enqueuePaymentTelemetry]);

  React.useEffect(() => {
    void flushQueue();
  }, [flushQueue]);

  React.useEffect(() => {
    if (!appOwnerId) return;

    const handleOnline = () => {
      void flushQueue();
    };

    const intervalId = window.setInterval(() => {
      void flushQueue();
    }, PAYMENT_TELEMETRY_FLUSH_INTERVAL_MS);

    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.clearInterval(intervalId);
    };
  }, [appOwnerId, flushQueue]);
};
