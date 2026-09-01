import type { OwnerId } from "@evolu/common";
import React from "react";
import type { CashuTokenRow } from "../../evolu";
import { isCashuTokenErrorState } from "../lib/cashuTokenState";
import { createCashuTokenId } from "../lib/cashuTokenIdentity";

interface UseCashuDomainParams {
  appOwnerId: OwnerId | null;
  cashuTokensAll: readonly CashuTokenRow[];
}

export const useCashuDomain = ({
  appOwnerId,
  cashuTokensAll,
}: UseCashuDomainParams) => {
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
    (row: CashuTokenRow, tokenRaw: string): boolean => {
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

  return {
    cashuTokensAllRef,
    cashuTokensHydratedRef,
    isCashuTokenKnownAny,
    isCashuTokenStored,
    rememberCashuTokenKnown,
  };
};
