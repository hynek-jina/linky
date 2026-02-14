import type { OwnerId } from "@evolu/common";
import React from "react";
import type { ContactId } from "../../evolu";
import { LOCAL_PAYMENT_EVENTS_STORAGE_KEY_PREFIX } from "../../utils/constants";
import {
  CASHU_SEEN_MINTS_STORAGE_KEY,
  normalizeMintUrl,
} from "../../utils/mint";
import {
  safeLocalStorageGetJson,
  safeLocalStorageSetJson,
} from "../../utils/storage";
import { makeLocalId } from "../../utils/validation";
import type { LocalPaymentEvent, MintUrlInput } from "../types/appTypes";

interface LogPaymentEventParams {
  amount?: number | null;
  contactId?: ContactId | null;
  direction: "in" | "out";
  error?: string | null;
  fee?: number | null;
  mint?: string | null;
  status: "ok" | "error";
  unit?: string | null;
}

interface UseOwnerScopedStorageParams {
  appOwnerIdRef: React.MutableRefObject<OwnerId | null>;
}

interface UseOwnerScopedStorageResult {
  logPaymentEvent: (event: LogPaymentEventParams) => void;
  makeLocalStorageKey: (prefix: string) => string;
  readSeenMintsFromStorage: () => string[];
  rememberSeenMint: (mintUrl: MintUrlInput) => void;
}

export const useOwnerScopedStorage = ({
  appOwnerIdRef,
}: UseOwnerScopedStorageParams): UseOwnerScopedStorageResult => {
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
    (event: LogPaymentEventParams) => {
      const ownerId = appOwnerIdRef.current;
      if (!ownerId) return;

      const nowSec = Math.floor(Date.now() / 1000);
      const amount =
        typeof event.amount === "number" && event.amount > 0
          ? Math.floor(event.amount)
          : null;
      const fee =
        typeof event.fee === "number" && event.fee > 0
          ? Math.floor(event.fee)
          : null;

      const mint = String(event.mint ?? "").trim();
      const unit = String(event.unit ?? "").trim();
      const err = String(event.error ?? "").trim();

      const entry: LocalPaymentEvent = {
        id: makeLocalId(),
        createdAtSec: nowSec,
        direction: event.direction,
        status: event.status,
        amount,
        fee,
        mint: mint || null,
        unit: unit || null,
        error: err ? err.slice(0, 1000) : null,
        contactId: event.contactId ? String(event.contactId) : null,
      };

      const existing = safeLocalStorageGetJson(
        makeLocalStorageKey(LOCAL_PAYMENT_EVENTS_STORAGE_KEY_PREFIX),
        [] as LocalPaymentEvent[],
      );
      const next = [entry, ...existing].slice(0, 250);
      safeLocalStorageSetJson(
        makeLocalStorageKey(LOCAL_PAYMENT_EVENTS_STORAGE_KEY_PREFIX),
        next,
      );
    },
    [appOwnerIdRef, makeLocalStorageKey],
  );

  return {
    logPaymentEvent,
    makeLocalStorageKey,
    readSeenMintsFromStorage,
    rememberSeenMint,
  };
};
