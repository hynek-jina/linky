import type { OwnerId } from "@evolu/common";
import * as Evolu from "@evolu/common";
import React from "react";
import { parseCashuToken } from "../../cashu";
import type { ContactId } from "../../evolu";
import { LAST_ACCEPTED_CASHU_TOKEN_STORAGE_KEY } from "../../utils/constants";
import { safeLocalStorageGet, safeLocalStorageSet } from "../../utils/storage";
import type { CashuTokenRowLike } from "../types/appTypes";

type EvoluMutations = ReturnType<typeof import("../../evolu").useEvolu>;

interface UseCashuDomainParams {
  appOwnerId: OwnerId | null;
  appOwnerIdRef: React.MutableRefObject<OwnerId | null>;
  cashuTokensAll: readonly CashuTokenRowLike[];
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
}

export const useCashuDomain = ({
  appOwnerId,
  appOwnerIdRef,
  cashuTokensAll,
  insert,
  logPaymentEvent,
}: UseCashuDomainParams) => {
  const buildCashuTokenPayload = React.useCallback(
    (args: {
      amount: number | null;
      mint: string | null;
      state: "accepted";
      token: string;
    }) => {
      const payload: {
        token: typeof Evolu.NonEmptyString.Type;
        state: typeof Evolu.NonEmptyString100.Type;
        amount?: typeof Evolu.PositiveInt.Type;
        mint?: typeof Evolu.NonEmptyString1000.Type;
      } = {
        token: args.token as typeof Evolu.NonEmptyString.Type,
        state: args.state as typeof Evolu.NonEmptyString100.Type,
      };

      const mint = String(args.mint ?? "").trim();
      if (mint) payload.mint = mint as typeof Evolu.NonEmptyString1000.Type;

      if (typeof args.amount === "number" && args.amount > 0) {
        payload.amount = Math.floor(
          args.amount,
        ) as typeof Evolu.PositiveInt.Type;
      }

      return payload;
    },
    [],
  );

  const cashuTokensAllRef = React.useRef(cashuTokensAll);
  React.useEffect(() => {
    cashuTokensAllRef.current = cashuTokensAll;
  }, [cashuTokensAll]);

  const rowMatchesToken = React.useCallback(
    (row: CashuTokenRowLike, tokenRaw: string): boolean => {
      const candidate = String(tokenRaw ?? "").trim();
      if (!candidate) return false;

      const storedRaw = String(row.rawToken ?? "").trim();
      const storedToken = String(row.token ?? "").trim();

      return (
        (storedRaw !== "" && storedRaw === candidate) ||
        (storedToken !== "" && storedToken === candidate)
      );
    },
    [],
  );

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

  const isCashuTokenStored = React.useCallback(
    (tokenRaw: string): boolean => {
      const raw = String(tokenRaw ?? "").trim();
      if (!raw) return false;

      const current = cashuTokensAllRef.current;
      return current.some((row) => {
        if (row.isDeleted) return false;
        return rowMatchesToken(row, raw);
      });
    },
    [rowMatchesToken],
  );

  const isCashuTokenKnownAny = React.useCallback(
    (tokenRaw: string): boolean => {
      const raw = String(tokenRaw ?? "").trim();
      if (!raw) return false;

      const current = cashuTokensAllRef.current;
      return current.some((row) => rowMatchesToken(row, raw));
    },
    [rowMatchesToken],
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
          const exists = current.some((row) =>
            rowMatchesToken(row, remembered),
          );
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
            buildCashuTokenPayload({
              token: remembered,
              mint,
              amount,
              state: "accepted",
            }),
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
    [
      appOwnerIdRef,
      buildCashuTokenPayload,
      insert,
      isCashuTokenKnownAny,
      logPaymentEvent,
      rowMatchesToken,
    ],
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
      return rowMatchesToken(row, remembered);
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
      buildCashuTokenPayload({
        token: remembered,
        mint,
        amount,
        state: "accepted",
      }),
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
    buildCashuTokenPayload,
    cashuTokensAll,
    insert,
    isCashuTokenKnownAny,
    logPaymentEvent,
    rowMatchesToken,
  ]);

  return {
    cashuTokensAllRef,
    cashuTokensHydratedRef,
    ensureCashuTokenPersisted,
    isCashuTokenKnownAny,
    isCashuTokenStored,
  };
};
