import type { OwnerId } from "@evolu/common";
import React from "react";
import { generateSecretKey, nip19 } from "nostr-tools";
import { getSharedAppNostrPool } from "../lib/nostrPool";
import {
  createPaymentTelemetryWrappedEvent,
  getPaymentTelemetryRetryDelaySec,
} from "../lib/paymentTelemetry";
import { publishSingleWrappedWithRetry } from "../lib/nostrPublishRetry";
import type { LocalPaymentTelemetryEvent } from "../types/appTypes";
import { NOSTR_RELAYS } from "../../nostrProfile";
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

interface UseAnonymousPaymentTelemetryParams {
  appOwnerId: OwnerId | null;
  makeLocalStorageKey: (prefix: string) => string;
}

const PAYMENT_TELEMETRY_FLUSH_INTERVAL_MS = 45_000;
const MAX_ITEMS_PER_FLUSH = 10;

const isTelemetryDirection = (value: unknown): value is "in" | "out" => {
  return value === "in" || value === "out";
};

const isTelemetryStatus = (value: unknown): value is "ok" | "error" => {
  return value === "ok" || value === "error";
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

const isTelemetryPlatform = (
  value: unknown,
): value is "android" | "ios" | "web" => {
  return value === "android" || value === "ios" || value === "web";
};

const isLocalPaymentTelemetryEvent = (
  value: unknown,
): value is LocalPaymentTelemetryEvent => {
  if (typeof value !== "object" || value === null) return false;

  const id = Reflect.get(value, "id");
  const createdAtSec = Reflect.get(value, "createdAtSec");
  const attemptCount = Reflect.get(value, "attemptCount");
  const lastAttemptAtSec = Reflect.get(value, "lastAttemptAtSec");
  const nextAttemptAtSec = Reflect.get(value, "nextAttemptAtSec");
  const direction = Reflect.get(value, "direction");
  const status = Reflect.get(value, "status");
  const method = Reflect.get(value, "method");
  const phase = Reflect.get(value, "phase");
  const platform = Reflect.get(value, "platform");
  const appVersion = Reflect.get(value, "appVersion");
  const amountBucket = Reflect.get(value, "amountBucket");
  const feeBucket = Reflect.get(value, "feeBucket");
  const errorCode = Reflect.get(value, "errorCode");

  return (
    typeof id === "string" &&
    typeof createdAtSec === "number" &&
    typeof attemptCount === "number" &&
    (typeof lastAttemptAtSec === "number" || lastAttemptAtSec === null) &&
    typeof nextAttemptAtSec === "number" &&
    isTelemetryDirection(direction) &&
    isTelemetryStatus(status) &&
    isTelemetryMethod(method) &&
    isTelemetryPhase(phase) &&
    isTelemetryPlatform(platform) &&
    typeof appVersion === "string" &&
    (typeof amountBucket === "string" || amountBucket === null) &&
    (typeof feeBucket === "string" || feeBucket === null) &&
    (typeof errorCode === "string" || errorCode === null)
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

export const useAnonymousPaymentTelemetry = ({
  appOwnerId,
  makeLocalStorageKey,
}: UseAnonymousPaymentTelemetryParams): void => {
  const flushRef = React.useRef<Promise<void> | null>(null);

  const flushQueue = React.useCallback(async () => {
    if (!appOwnerId) return;
    if (flushRef.current) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;

    const storageKey = makeLocalStorageKey(
      LOCAL_PENDING_PAYMENT_TELEMETRY_STORAGE_KEY_PREFIX,
    );
    const lockKey = makeLocalStorageKey(
      LOCAL_PENDING_PAYMENT_TELEMETRY_LOCK_STORAGE_KEY_PREFIX,
    );

    const run = withLocalStorageLeaseLock({
      key: lockKey,
      fn: async () => {
        const queue = readQueue(storageKey);
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
        const pool = await getSharedAppNostrPool();
        const remainingById = new Map(queue.map((item) => [item.id, item]));

        for (const item of dueItems) {
          const wrappedEvent = createPaymentTelemetryWrappedEvent({
            item,
            recipientPublicKey,
            senderPrivateKey: generateSecretKey(),
          });
          const outcome = await publishSingleWrappedWithRetry({
            pool,
            relays: NOSTR_RELAYS,
            event: wrappedEvent,
          });

          if (outcome.anySuccess) {
            remainingById.delete(item.id);
            continue;
          }

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

        writeQueue(storageKey, Array.from(remainingById.values()));
      },
    }).finally(() => {
      flushRef.current = null;
    });

    flushRef.current = run;
    await run;
  }, [appOwnerId, makeLocalStorageKey]);

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
