import type { OwnerId } from "@evolu/common";
import React from "react";
import type { JsonValue } from "../../types/json";
import {
  LOCAL_PAYMENT_EVENTS_STORAGE_KEY_PREFIX,
  LOCAL_PENDING_PAYMENT_TELEMETRY_STORAGE_KEY_PREFIX,
} from "../../utils/constants";
import {
  CASHU_SEEN_MINTS_STORAGE_KEY,
  normalizeMintUrl,
} from "../../utils/mint";
import {
  safeLocalStorageGetJson,
  safeLocalStorageSetJson,
} from "../../utils/storage";
import {
  createLocalPaymentTelemetryEvent,
  normalizePaymentTelemetryStatus,
} from "../lib/paymentTelemetry";
import type {
  LocalPaymentEvent,
  LocalPaymentTelemetryEvent,
  LoggedPaymentEventParams,
  MintUrlInput,
} from "../types/appTypes";
import { isUnknownContactId } from "./messages/contactIdentity";

type EvoluMutations = ReturnType<typeof import("../../evolu").useEvolu>;

type TransactionInsertPayload = {
  category: string;
  createdAtSec: number;
  detailsJson?: string;
  direction: "in" | "out";
  iconKind: string;
  status: string;
  amount?: number;
  contactId?: string;
  error?: string;
  fee?: number;
  method?: string;
  mint?: string;
  note?: string;
  pendingLabel?: string;
  phase?: string;
  unit?: string;
};

type TransactionEventLike = {
  amount?: number | null;
  contactId?: string | null;
  createdAtSec?: number | null;
  details?: JsonValue | null;
  direction: "in" | "out";
  error?: string | null;
  fee?: number | null;
  method?: string | null;
  mint?: string | null;
  note?: string | null;
  phase?: string | null;
  status: string;
  unit?: string | null;
};

const LEGACY_PAYMENT_EVENTS_MIGRATED_SUFFIX = ".migratedToEvolu.v2";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const serializeJsonValue = (
  value: JsonValue | null | undefined,
): string | null => {
  if (value === null || value === undefined) return null;
  try {
    const serialized = JSON.stringify(value);
    return serialized && serialized !== "null" ? serialized : null;
  } catch {
    return null;
  }
};

const isLegacyPaymentEvent = (value: unknown): value is LocalPaymentEvent => {
  if (!isRecord(value)) return false;
  if (value.direction !== "in" && value.direction !== "out") return false;
  if (
    value.status !== "ok" &&
    value.status !== "error" &&
    value.status !== "declined"
  ) {
    return false;
  }

  const createdAtSec = Number(value.createdAtSec);
  return Number.isFinite(createdAtSec) && createdAtSec > 0;
};

const buildTransactionInsertPayload = (args: {
  createdAtSec: number;
  event: TransactionEventLike;
}): TransactionInsertPayload => {
  const amount =
    typeof args.event.amount === "number" && args.event.amount > 0
      ? Math.floor(args.event.amount)
      : null;
  const fee =
    typeof args.event.fee === "number" && args.event.fee >= 0
      ? Math.floor(args.event.fee)
      : null;
  const mint = String(args.event.mint ?? "").trim();
  const unit = String(args.event.unit ?? "").trim();
  const error = String(args.event.error ?? "").trim();
  const status = normalizePaymentTelemetryStatus({
    error: args.event.error,
    status:
      args.event.status === "ok" ||
      args.event.status === "error" ||
      args.event.status === "declined"
        ? args.event.status
        : "error",
  });

  const category = (() => {
    if (args.event.method === "cashu_chat") return "contacts";
    if (
      args.event.method === "lightning_address" ||
      args.event.method === "lightning_invoice"
    ) {
      return "lightning";
    }
    return "cashu";
  })();

  const payload: TransactionInsertPayload = {
    category,
    createdAtSec: args.createdAtSec,
    direction: args.event.direction,
    iconKind:
      category === "contacts"
        ? "contact"
        : category === "lightning"
          ? "lightning"
          : "cashu",
    status,
  };

  const contactId = String(args.event.contactId ?? "").trim();
  const storedContactId = isUnknownContactId(contactId) ? "" : contactId;
  const detailsJson = serializeJsonValue(args.event.details);
  const method = String(args.event.method ?? "").trim();
  const note = String(args.event.note ?? "").trim();
  const phase = String(args.event.phase ?? "").trim();
  const pendingLabel = status === "ok" && phase === "publish" ? "pending" : "";

  if (amount !== null) payload.amount = amount;
  if (fee !== null) payload.fee = fee;
  if (mint) payload.mint = mint;
  if (unit) payload.unit = unit;
  if (error) payload.error = error.slice(0, 1000);
  if (storedContactId) payload.contactId = storedContactId;
  if (detailsJson) payload.detailsJson = detailsJson;
  if (method) payload.method = method;
  if (note) payload.note = note.slice(0, 1000);
  if (phase) payload.phase = phase;
  if (pendingLabel) payload.pendingLabel = pendingLabel;

  return payload;
};

interface UseOwnerScopedStorageParams {
  appOwnerIdRef: React.MutableRefObject<OwnerId | null>;
  insert: EvoluMutations["insert"];
  recordTransactionsOwnerWriteRef: React.MutableRefObject<
    ((count?: number) => void) | null
  >;
  transactionsOwnerIdRef: React.MutableRefObject<OwnerId | null>;
}

interface UseOwnerScopedStorageResult {
  logPaymentEvent: (event: LoggedPaymentEventParams) => void;
  makeLocalStorageKey: (prefix: string) => string;
  migrateLegacyPaymentEventsToEvolu: (
    ownerId: OwnerId,
    transactionOwnerId: OwnerId | null,
  ) => void;
  readSeenMintsFromStorage: () => string[];
  rememberSeenMint: (mintUrl: MintUrlInput) => void;
}

export const useOwnerScopedStorage = ({
  appOwnerIdRef,
  insert,
  recordTransactionsOwnerWriteRef,
  transactionsOwnerIdRef,
}: UseOwnerScopedStorageParams): UseOwnerScopedStorageResult => {
  const migratedLegacyPaymentsKeyRef = React.useRef<string | null>(null);

  const makeLocalStorageKey = React.useCallback(
    (prefix: string): string => {
      const ownerId = appOwnerIdRef.current;
      return `${prefix}.${String(ownerId ?? "anon")}`;
    },
    [appOwnerIdRef],
  );

  const readSeenMintsFromStorage = React.useCallback((): string[] => {
    try {
      const raw = localStorage.getItem(
        makeLocalStorageKey(CASHU_SEEN_MINTS_STORAGE_KEY),
      );
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map((value) => normalizeMintUrl(String(value ?? "")))
        .filter(Boolean);
    } catch {
      return [];
    }
  }, [makeLocalStorageKey]);

  const rememberSeenMint = React.useCallback(
    (mintUrl: MintUrlInput): void => {
      const cleaned = normalizeMintUrl(mintUrl);
      if (!cleaned) return;
      try {
        const key = makeLocalStorageKey(CASHU_SEEN_MINTS_STORAGE_KEY);
        const existing = new Set(readSeenMintsFromStorage());
        existing.add(cleaned);
        localStorage.setItem(
          key,
          JSON.stringify(Array.from(existing).slice(0, 50)),
        );
      } catch {
        // ignore
      }
    },
    [makeLocalStorageKey, readSeenMintsFromStorage],
  );

  const logPaymentEvent = React.useCallback(
    (event: LoggedPaymentEventParams) => {
      const ownerId = appOwnerIdRef.current ?? transactionsOwnerIdRef.current;
      if (!ownerId) return;

      const nowSec = Math.floor(Date.now() / 1000);
      const transactionPayload = buildTransactionInsertPayload({
        createdAtSec: nowSec,
        event: {
          amount: event.amount ?? null,
          contactId: event.contactId ? String(event.contactId) : null,
          details: event.details ?? null,
          direction: event.direction,
          error: event.error ?? null,
          fee: event.fee ?? null,
          method: event.method ?? null,
          mint: event.mint ?? null,
          note: event.note ?? null,
          phase: event.phase ?? null,
          status: event.status,
          unit: event.unit ?? null,
        },
      });

      const transactionOwnerId = transactionsOwnerIdRef.current ?? ownerId;
      try {
        const insertResult = transactionOwnerId
          ? insert("transaction", transactionPayload, {
              ownerId: transactionOwnerId,
            })
          : insert("transaction", transactionPayload);
        if (insertResult.ok) {
          recordTransactionsOwnerWriteRef.current?.();
        }
      } catch {
        // Transaction history must never break payment receive/send flows.
      }

      const telemetryEntry = createLocalPaymentTelemetryEvent(event, nowSec);
      const emptyTelemetryQueue: LocalPaymentTelemetryEvent[] = [];
      const telemetryQueue = safeLocalStorageGetJson(
        makeLocalStorageKey(LOCAL_PENDING_PAYMENT_TELEMETRY_STORAGE_KEY_PREFIX),
        emptyTelemetryQueue,
      );
      const nextTelemetryQueue = [telemetryEntry, ...telemetryQueue].slice(
        0,
        250,
      );
      safeLocalStorageSetJson(
        makeLocalStorageKey(LOCAL_PENDING_PAYMENT_TELEMETRY_STORAGE_KEY_PREFIX),
        nextTelemetryQueue,
      );
    },
    [
      appOwnerIdRef,
      insert,
      makeLocalStorageKey,
      recordTransactionsOwnerWriteRef,
      transactionsOwnerIdRef,
    ],
  );

  const migrateLegacyPaymentEventsToEvolu = React.useCallback(
    (ownerId: OwnerId, transactionOwnerId: OwnerId | null) => {
      const legacyStorageKey = `${LOCAL_PAYMENT_EVENTS_STORAGE_KEY_PREFIX}.${String(ownerId)}`;
      const migratedKey = `${legacyStorageKey}${LEGACY_PAYMENT_EVENTS_MIGRATED_SUFFIX}`;

      if (migratedLegacyPaymentsKeyRef.current === migratedKey) return;

      try {
        if (localStorage.getItem(migratedKey) === "1") {
          migratedLegacyPaymentsKeyRef.current = migratedKey;
          return;
        }
      } catch {
        return;
      }

      const legacyItems = safeLocalStorageGetJson<readonly JsonValue[]>(
        legacyStorageKey,
        [],
      );
      if (!Array.isArray(legacyItems) || legacyItems.length === 0) {
        try {
          localStorage.setItem(migratedKey, "1");
        } catch {
          // ignore
        }
        migratedLegacyPaymentsKeyRef.current = migratedKey;
        return;
      }

      const writeOwnerId = transactionOwnerId ?? ownerId;

      for (const legacyItem of legacyItems) {
        if (!isLegacyPaymentEvent(legacyItem)) continue;

        const transactionPayload = buildTransactionInsertPayload({
          createdAtSec: Math.trunc(Number(legacyItem.createdAtSec)),
          event: legacyItem,
        });

        try {
          const insertResult = writeOwnerId
            ? insert("transaction", transactionPayload, {
                ownerId: writeOwnerId,
              })
            : insert("transaction", transactionPayload);

          if (insertResult.ok) {
            recordTransactionsOwnerWriteRef.current?.();
          }
        } catch {
          // ignore legacy migration failures and keep payment flows unaffected
        }
      }

      try {
        localStorage.setItem(migratedKey, "1");
      } catch {
        // ignore
      }
      migratedLegacyPaymentsKeyRef.current = migratedKey;
    },
    [insert, recordTransactionsOwnerWriteRef],
  );

  return {
    logPaymentEvent,
    makeLocalStorageKey,
    migrateLegacyPaymentEventsToEvolu,
    readSeenMintsFromStorage,
    rememberSeenMint,
  };
};
