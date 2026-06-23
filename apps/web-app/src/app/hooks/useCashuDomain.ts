import type { OwnerId } from "@evolu/common";
import * as Evolu from "@evolu/common";
import React from "react";
import { parseCashuToken } from "../../cashu";
import { LAST_ACCEPTED_CASHU_TOKEN_STORAGE_KEY } from "../../utils/constants";
import { safeLocalStorageGet, safeLocalStorageSet } from "../../utils/storage";
import { isCashuTokenErrorState } from "../lib/cashuTokenState";
import { createCashuTokenId } from "../lib/cashuTokenIdentity";
import type {
  CashuTokenRowLike,
  LoggedPaymentEventParams,
} from "../types/appTypes";

type EvoluMutations = ReturnType<typeof import("../../evolu").useEvolu>;

interface UseCashuDomainParams {
  appOwnerId: OwnerId | null;
  appOwnerIdRef: React.MutableRefObject<OwnerId | null>;
  cashuTokensAll: readonly CashuTokenRowLike[];
  upsert: EvoluMutations["upsert"];
  logPaymentEvent: (event: LoggedPaymentEventParams) => void;
}

export const useCashuDomain = ({
  appOwnerId,
  appOwnerIdRef,
  cashuTokensAll,
  upsert,
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
        id: ReturnType<typeof createCashuTokenId>;
        token: typeof Evolu.NonEmptyString.Type;
        state: typeof Evolu.NonEmptyString100.Type;
      } = {
        id: createCashuTokenId(args.token),
        token: args.token as typeof Evolu.NonEmptyString.Type,
        state: args.state as typeof Evolu.NonEmptyString100.Type,
      };

      return payload;
    },
    [],
  );

  const cashuTokensAllRef = React.useRef(cashuTokensAll);
  React.useEffect(() => {
    cashuTokensAllRef.current = cashuTokensAll;
  }, [cashuTokensAll]);

  const optimisticallyKnownCashuTokensRef = React.useRef<Set<string>>(
    new Set(),
  );

  const normalizeCashuTokenText = React.useCallback(
    (tokenRaw: string): string => {
      return String(tokenRaw ?? "").trim();
    },
    [],
  );

  const rowMatchesToken = React.useCallback(
    (row: CashuTokenRowLike, tokenRaw: string): boolean => {
      const candidate = normalizeCashuTokenText(tokenRaw);
      if (!candidate) return false;
      if (String(row.id ?? "") === String(createCashuTokenId(candidate))) {
        return true;
      }

      const storedRaw = String(row.rawToken ?? "").trim();
      const storedToken = String(row.token ?? "").trim();

      return (
        (storedRaw !== "" && storedRaw === candidate) ||
        (storedToken !== "" && storedToken === candidate)
      );
    },
    [normalizeCashuTokenText],
  );

  const isOptimisticallyKnownCashuToken = React.useCallback(
    (tokenRaw: string): boolean => {
      const normalized = normalizeCashuTokenText(tokenRaw);
      if (!normalized) return false;
      return optimisticallyKnownCashuTokensRef.current.has(normalized);
    },
    [normalizeCashuTokenText],
  );

  const rememberCashuTokenKnown = React.useCallback(
    (...tokens: readonly string[]) => {
      for (const token of tokens) {
        const normalized = normalizeCashuTokenText(token);
        if (!normalized) continue;
        optimisticallyKnownCashuTokensRef.current.add(normalized);
      }
    },
    [normalizeCashuTokenText],
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
      const raw = normalizeCashuTokenText(tokenRaw);
      if (!raw) return false;
      if (isOptimisticallyKnownCashuToken(raw)) return true;

      const current = cashuTokensAllRef.current;
      const deterministicId = String(createCashuTokenId(raw));
      return current.some((row) => {
        if (String(row.id ?? "") === deterministicId) return true;
        if (row.isDeleted) return false;
        if (isCashuTokenErrorState(row.state)) return false;
        return rowMatchesToken(row, raw);
      });
    },
    [isOptimisticallyKnownCashuToken, normalizeCashuTokenText, rowMatchesToken],
  );

  const isCashuTokenKnownAny = React.useCallback(
    (tokenRaw: string): boolean => {
      const raw = normalizeCashuTokenText(tokenRaw);
      if (!raw) return false;
      if (isOptimisticallyKnownCashuToken(raw)) return true;

      const current = cashuTokensAllRef.current;
      return current.some((row) => {
        return rowMatchesToken(row, raw);
      });
    },
    [isOptimisticallyKnownCashuToken, normalizeCashuTokenText, rowMatchesToken],
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

          const result = upsert(
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
              method: "cashu_receive",
              phase: "receive",
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
      upsert,
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

    const result = upsert(
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
        method: "cashu_receive",
        phase: "receive",
      });
      safeLocalStorageSet(LAST_ACCEPTED_CASHU_TOKEN_STORAGE_KEY, "");
    }
  }, [
    appOwnerIdRef,
    buildCashuTokenPayload,
    cashuTokensAll,
    upsert,
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
    rememberCashuTokenKnown,
  };
};
