import type { OwnerId } from "@evolu/common";
import * as Evolu from "@evolu/common";
import React from "react";
import { parseCashuToken } from "../../cashu";
import type { ContactId, CredoTokenId } from "../../evolu";
import { LAST_ACCEPTED_CASHU_TOKEN_STORAGE_KEY } from "../../utils/constants";
import { safeLocalStorageGet, safeLocalStorageSet } from "../../utils/storage";
import type {
  CashuTokenRowLike,
  ContactRowLike,
  CredoTokenRow,
} from "../types/appTypes";

type EvoluMutations = ReturnType<typeof import("../../evolu").useEvolu>;

interface UseCashuDomainParams {
  appOwnerId: OwnerId | null;
  appOwnerIdRef: React.MutableRefObject<OwnerId | null>;
  cashuTokensAll: readonly CashuTokenRowLike[];
  contacts: readonly ContactRowLike[];
  credoTokensAll: readonly CredoTokenRow[];
  insert: EvoluMutations["insert"];
  logPaymentEvent: (event: {
    amount?: number | null;
    contactId?: ContactId | null;
    direction: "in" | "out";
    error?: string | null;
    fee?: number | null;
    mint?: string | null;
    status: "ok" | "error";
    unit?: string | null;
  }) => void;
  update: EvoluMutations["update"];
}

export const useCashuDomain = ({
  appOwnerId,
  appOwnerIdRef,
  cashuTokensAll,
  contacts,
  credoTokensAll,
  insert,
  logPaymentEvent,
  update,
}: UseCashuDomainParams) => {
  const updateCredoToken = React.useCallback(
    (payload: {
      id: CredoTokenId;
      settledAmount?: typeof Evolu.PositiveInt.Type | null;
      settledAtSec?: typeof Evolu.PositiveInt.Type | null;
    }) => {
      const ownerId = appOwnerIdRef.current;
      if (ownerId) {
        return update("credoToken", payload, { ownerId });
      }
      return update("credoToken", payload);
    },
    [appOwnerIdRef, update],
  );

  const insertCredoToken = React.useCallback(
    (payload: {
      amount: typeof Evolu.PositiveInt.Type;
      contactId: string | null;
      createdAtSec: typeof Evolu.PositiveInt.Type;
      direction: typeof Evolu.NonEmptyString100.Type;
      expiresAtSec: typeof Evolu.PositiveInt.Type;
      issuer: typeof Evolu.NonEmptyString1000.Type;
      promiseId: typeof Evolu.NonEmptyString1000.Type;
      rawToken: typeof Evolu.NonEmptyString1000.Type;
      recipient: typeof Evolu.NonEmptyString1000.Type;
      settledAmount: null;
      settledAtSec: null;
      unit: typeof Evolu.NonEmptyString100.Type;
    }) => {
      const ownerId = appOwnerIdRef.current;
      if (ownerId) {
        return insert("credoToken", payload, { ownerId });
      }
      return insert("credoToken", payload);
    },
    [appOwnerIdRef, insert],
  );

  const cashuTokensAllRef = React.useRef(cashuTokensAll);
  React.useEffect(() => {
    cashuTokensAllRef.current = cashuTokensAll;
  }, [cashuTokensAll]);

  const credoTokensAllRef = React.useRef(credoTokensAll);
  React.useEffect(() => {
    credoTokensAllRef.current = credoTokensAll;
  }, [credoTokensAll]);

  const cashuTokensHydratedRef = React.useRef(false);
  const cashuTokensHydrationTimeoutRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (!appOwnerId) {
      cashuTokensHydratedRef.current = false;
      if (cashuTokensHydrationTimeoutRef.current !== null) {
        window.clearTimeout(cashuTokensHydrationTimeoutRef.current);
        cashuTokensHydrationTimeoutRef.current = null;
      }
      return;
    }

    if (cashuTokensAll.length > 0) {
      cashuTokensHydratedRef.current = true;
      if (cashuTokensHydrationTimeoutRef.current !== null) {
        window.clearTimeout(cashuTokensHydrationTimeoutRef.current);
        cashuTokensHydrationTimeoutRef.current = null;
      }
      return;
    }

    if (cashuTokensHydrationTimeoutRef.current !== null) {
      window.clearTimeout(cashuTokensHydrationTimeoutRef.current);
    }

    cashuTokensHydrationTimeoutRef.current = window.setTimeout(() => {
      cashuTokensHydratedRef.current = true;
      cashuTokensHydrationTimeoutRef.current = null;
    }, 1200);

    return () => {
      if (cashuTokensHydrationTimeoutRef.current !== null) {
        window.clearTimeout(cashuTokensHydrationTimeoutRef.current);
        cashuTokensHydrationTimeoutRef.current = null;
      }
    };
  }, [appOwnerId, cashuTokensAll]);

  const isCashuTokenStored = React.useCallback((tokenRaw: string): boolean => {
    const raw = String(tokenRaw ?? "").trim();
    if (!raw) return false;

    const current = cashuTokensAllRef.current;
    return current.some((row) => {
      if (row.isDeleted) return false;
      const stored = String(row.rawToken ?? row.token ?? "").trim();
      return stored && stored === raw;
    });
  }, []);

  const isCashuTokenKnownAny = React.useCallback(
    (tokenRaw: string): boolean => {
      const raw = String(tokenRaw ?? "").trim();
      if (!raw) return false;

      const current = cashuTokensAllRef.current;
      return current.some((row) => {
        const stored = String(row.rawToken ?? row.token ?? "").trim();
        return stored && stored === raw;
      });
    },
    [],
  );

  const isCredoPromiseKnown = React.useCallback(
    (promiseId: string): boolean => {
      const id = String(promiseId ?? "").trim();
      if (!id) return false;

      const current = credoTokensAllRef.current;
      return current.some((row) => String(row.promiseId ?? "").trim() === id);
    },
    [],
  );

  const applyCredoSettlement = React.useCallback(
    (args: { amount: number; promiseId: string; settledAtSec: number }) => {
      const id = String(args.promiseId ?? "").trim();
      if (!id) return;

      const current = credoTokensAllRef.current;
      const row = current.find(
        (candidate) =>
          String((candidate as CredoTokenRow).promiseId ?? "") === id,
      );
      if (!row) return;

      const existing = Number((row as CredoTokenRow).settledAmount ?? 0) || 0;
      const totalAmount = Number((row as CredoTokenRow).amount ?? 0) || 0;
      const nextSettled = Math.min(
        totalAmount,
        existing + Math.max(0, args.amount),
      );

      updateCredoToken({
        id: (row as CredoTokenRow).id as CredoTokenId,
        settledAmount:
          nextSettled > 0
            ? (nextSettled as typeof Evolu.PositiveInt.Type)
            : null,
        settledAtSec:
          args.settledAtSec > 0
            ? (Math.floor(args.settledAtSec) as typeof Evolu.PositiveInt.Type)
            : null,
      });
    },
    [updateCredoToken],
  );

  const ensuredTokenRef = React.useRef<Set<string>>(new Set());

  const ensureCashuTokenPersisted = React.useCallback(
    (token: string) => {
      const remembered = String(token ?? "").trim();
      if (!remembered) return;

      if (isCashuTokenKnownAny(remembered)) {
        safeLocalStorageSet(LAST_ACCEPTED_CASHU_TOKEN_STORAGE_KEY, "");
        return;
      }

      window.setTimeout(() => {
        try {
          const ownerId = appOwnerIdRef.current;
          if (!ownerId) return;

          const current = cashuTokensAllRef.current;
          const exists = current.some((row) => {
            const stored = String(row.token ?? row.rawToken ?? "").trim();
            return stored && stored === remembered;
          });
          if (exists) {
            safeLocalStorageSet(LAST_ACCEPTED_CASHU_TOKEN_STORAGE_KEY, "");
            return;
          }

          if (ensuredTokenRef.current.has(remembered)) return;
          ensuredTokenRef.current.add(remembered);

          const parsed = parseCashuToken(remembered);
          const mint = parsed?.mint?.trim() ? parsed.mint.trim() : null;
          const amount =
            parsed?.amount && parsed.amount > 0 ? parsed.amount : null;

          const result = insert(
            "cashuToken",
            {
              token: remembered as typeof Evolu.NonEmptyString.Type,
              rawToken: null,
              mint: mint
                ? (mint as typeof Evolu.NonEmptyString1000.Type)
                : null,
              unit: null,
              amount:
                typeof amount === "number" && amount > 0
                  ? (Math.floor(amount) as typeof Evolu.PositiveInt.Type)
                  : null,
              state: "accepted" as typeof Evolu.NonEmptyString100.Type,
              error: null,
            },
            { ownerId },
          );

          if (result.ok) {
            logPaymentEvent({
              direction: "in",
              status: "ok",
              amount: typeof amount === "number" ? amount : null,
              fee: null,
              mint,
              unit: null,
              error: null,
              contactId: null,
            });
            safeLocalStorageSet(LAST_ACCEPTED_CASHU_TOKEN_STORAGE_KEY, "");
          }
        } catch {
          // ignore
        }
      }, 800);
    },
    [appOwnerIdRef, insert, isCashuTokenKnownAny, logPaymentEvent],
  );

  const insertCredoPromise = React.useCallback(
    (args: {
      amount: number;
      createdAtSec: number;
      direction: "in" | "out";
      expiresAtSec: number;
      issuer: string;
      promiseId: string;
      recipient: string;
      token: string;
      unit: string;
    }) => {
      if (isCredoPromiseKnown(args.promiseId)) return;

      const contactNpub =
        args.direction === "out" ? args.recipient : args.issuer;
      const contact = contacts.find(
        (row) =>
          String(row.npub ?? "").trim() === String(contactNpub ?? "").trim(),
      );

      const payload = {
        promiseId: args.promiseId as typeof Evolu.NonEmptyString1000.Type,
        issuer: args.issuer as typeof Evolu.NonEmptyString1000.Type,
        recipient: args.recipient as typeof Evolu.NonEmptyString1000.Type,
        amount: Math.max(
          1,
          Math.floor(args.amount),
        ) as typeof Evolu.PositiveInt.Type,
        unit: String(args.unit ?? "sat") as typeof Evolu.NonEmptyString100.Type,
        createdAtSec: Math.max(
          1,
          Math.floor(args.createdAtSec),
        ) as typeof Evolu.PositiveInt.Type,
        expiresAtSec: Math.max(
          1,
          Math.floor(args.expiresAtSec),
        ) as typeof Evolu.PositiveInt.Type,
        settledAmount: null,
        settledAtSec: null,
        direction: args.direction as typeof Evolu.NonEmptyString100.Type,
        contactId: contact?.id ? String(contact.id) : null,
        rawToken: args.token as typeof Evolu.NonEmptyString1000.Type,
      };

      insertCredoToken(payload);
    },
    [contacts, insertCredoToken, isCredoPromiseKnown],
  );

  React.useEffect(() => {
    const remembered = String(
      safeLocalStorageGet(LAST_ACCEPTED_CASHU_TOKEN_STORAGE_KEY) ?? "",
    ).trim();

    if (!remembered) return;
    if (isCashuTokenKnownAny(remembered)) {
      safeLocalStorageSet(LAST_ACCEPTED_CASHU_TOKEN_STORAGE_KEY, "");
      return;
    }

    ensureCashuTokenPersisted(remembered);
  }, [cashuTokensAll, ensureCashuTokenPersisted, isCashuTokenKnownAny]);

  const autoRestoreLastAcceptedTokenAttemptedRef = React.useRef(false);
  React.useEffect(() => {
    if (autoRestoreLastAcceptedTokenAttemptedRef.current) return;
    autoRestoreLastAcceptedTokenAttemptedRef.current = true;

    const remembered = String(
      safeLocalStorageGet(LAST_ACCEPTED_CASHU_TOKEN_STORAGE_KEY) ?? "",
    ).trim();
    if (!remembered) return;

    if (isCashuTokenKnownAny(remembered)) {
      safeLocalStorageSet(LAST_ACCEPTED_CASHU_TOKEN_STORAGE_KEY, "");
      return;
    }

    const ownerId = appOwnerIdRef.current;
    if (!ownerId) return;

    const exists = cashuTokensAll.some((row) => {
      if (row.isDeleted) return false;
      const stored = String(row.token ?? row.rawToken ?? "").trim();
      return stored && stored === remembered;
    });

    if (exists) {
      safeLocalStorageSet(LAST_ACCEPTED_CASHU_TOKEN_STORAGE_KEY, "");
      return;
    }

    const parsed = parseCashuToken(remembered);
    const mint = parsed?.mint?.trim() ? parsed.mint.trim() : null;
    const amount = parsed?.amount && parsed.amount > 0 ? parsed.amount : null;

    const result = insert(
      "cashuToken",
      {
        token: remembered as typeof Evolu.NonEmptyString.Type,
        rawToken: null,
        mint: mint ? (mint as typeof Evolu.NonEmptyString1000.Type) : null,
        unit: null,
        amount:
          typeof amount === "number" && amount > 0
            ? (Math.floor(amount) as typeof Evolu.PositiveInt.Type)
            : null,
        state: "accepted" as typeof Evolu.NonEmptyString100.Type,
        error: null,
      },
      { ownerId },
    );

    if (result.ok) {
      logPaymentEvent({
        direction: "in",
        status: "ok",
        amount: typeof amount === "number" ? amount : null,
        fee: null,
        mint,
        unit: null,
        error: null,
        contactId: null,
      });
      safeLocalStorageSet(LAST_ACCEPTED_CASHU_TOKEN_STORAGE_KEY, "");
    }
  }, [
    appOwnerIdRef,
    cashuTokensAll,
    insert,
    isCashuTokenKnownAny,
    logPaymentEvent,
  ]);

  return {
    applyCredoSettlement,
    cashuTokensAllRef,
    cashuTokensHydratedRef,
    credoTokensAllRef,
    ensureCashuTokenPersisted,
    insertCredoPromise,
    isCashuTokenKnownAny,
    isCashuTokenStored,
    isCredoPromiseKnown,
  };
};
