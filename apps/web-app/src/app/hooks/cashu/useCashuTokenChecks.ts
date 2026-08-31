import * as Evolu from "@evolu/common";
import { Either } from "effect";
import React from "react";
import type { CashuTokenId, CashuTokenRow } from "../../../evolu";
import { navigateTo } from "../../../hooks/useRouting";
import { resolveCashuTokenStoredOwnerLaneById } from "../../lib/cashuOwnerLane";
import type {
  CheckAllCashuTokens,
  CheckCashuTokenRow,
} from "../composition/useLinkshuComposition";

type EvoluMutations = ReturnType<typeof import("../../../evolu").useEvolu>;

interface UseCashuTokenChecksParams {
  appOwnerId: Evolu.OwnerId | null;
  cashuBulkCheckIsBusy: boolean;
  cashuIsBusy: boolean;
  cashuTokensAll: readonly CashuTokenRow[];
  /** Null until the linkshu runtime is composed (seed + owners resolved). */
  checkAllCashuTokens: CheckAllCashuTokens | null;
  checkCashuTokenRow: CheckCashuTokenRow | null;
  pendingCashuDeleteId: CashuTokenId | null;
  pushToast: (message: string) => void;
  setCashuBulkCheckIsBusy: React.Dispatch<React.SetStateAction<boolean>>;
  setCashuIsBusy: React.Dispatch<React.SetStateAction<boolean>>;
  setPendingCashuDeleteId: React.Dispatch<
    React.SetStateAction<CashuTokenId | null>
  >;
  setStatus: React.Dispatch<React.SetStateAction<string | null>>;
  t: (key: string) => string;
  update: EvoluMutations["update"];
}

/**
 * NUT-07 token validation over linkshu `Validation`: the mint's checkstate
 * answer is the sole truth, fully spent rows become `error` rows, and a
 * partially spent row keeps only its surviving proofs — the package owns the
 * pruning and re-encoding. This hook wraps the calls with busy flags,
 * statuses, and toasts, and hosts the (unrelated) row-delete confirmation.
 */
export const useCashuTokenChecks = ({
  appOwnerId,
  cashuBulkCheckIsBusy,
  cashuIsBusy,
  cashuTokensAll,
  checkAllCashuTokens,
  checkCashuTokenRow,
  pendingCashuDeleteId,
  pushToast,
  setCashuBulkCheckIsBusy,
  setCashuIsBusy,
  setPendingCashuDeleteId,
  setStatus,
  t,
  update,
}: UseCashuTokenChecksParams) => {
  const handleDeleteCashuToken = React.useCallback(
    (
      id: CashuTokenId,
      options?: { navigate?: boolean; setStatus?: boolean },
    ) => {
      const { navigate = true, setStatus: setStatusEnabled = true } =
        options ?? {};
      const ownerId = resolveCashuTokenStoredOwnerLaneById(
        cashuTokensAll,
        id,
        appOwnerId,
      );
      const payload = { id, isDeleted: Evolu.sqliteTrue };
      const result = ownerId
        ? update("cashuToken", payload, { ownerId })
        : update("cashuToken", payload);
      if (result.ok) {
        if (setStatusEnabled) {
          setStatus(t("cashuDeleted"));
        }
        setPendingCashuDeleteId(null);
        if (navigate) {
          navigateTo({ route: "wallet" });
        }
        return;
      }
      if (setStatusEnabled) {
        setStatus(`${t("errorPrefix")}: ${String(result.error)}`);
      }
    },
    [appOwnerId, cashuTokensAll, setPendingCashuDeleteId, setStatus, t, update],
  );

  const checkAndRefreshCashuToken = React.useCallback(
    async (
      id: CashuTokenId,
    ): Promise<"ok" | "invalid" | "transient" | "skipped"> => {
      if (checkCashuTokenRow === null) {
        pushToast(t("errorPrefix"));
        return "skipped";
      }
      if (cashuIsBusy) return "skipped";
      setCashuIsBusy(true);
      setStatus(t("cashuChecking"));
      try {
        const outcome = await checkCashuTokenRow(String(id));
        if (Either.isLeft(outcome)) {
          pushToast(t("errorPrefix"));
          return "skipped";
        }
        switch (outcome.right.status) {
          case "live":
            setStatus(null);
            pushToast(t("cashuCheckOk"));
            return "ok";
          case "spent":
            setStatus(t("cashuInvalid"));
            pushToast(t("cashuInvalid"));
            return "invalid";
          case "unavailable":
            setStatus(t("cashuCheckFailed"));
            pushToast(t("cashuCheckFailed"));
            return "transient";
        }
      } finally {
        setCashuIsBusy(false);
      }
    },
    [cashuIsBusy, checkCashuTokenRow, pushToast, setCashuIsBusy, setStatus, t],
  );

  const checkAllCashuTokensAndDeleteInvalid = React.useCallback(async () => {
    if (checkAllCashuTokens === null) return;
    if (cashuBulkCheckIsBusy) return;
    if (cashuIsBusy) return;
    setCashuBulkCheckIsBusy(true);
    setCashuIsBusy(true);
    setStatus(t("cashuChecking"));
    try {
      const report = await checkAllCashuTokens();
      setStatus(null);
      if (report.markedSpent.length > 0) {
        pushToast(t("cashuInvalid"));
      } else if (report.unavailableMints.length > 0) {
        pushToast(t("cashuCheckFailed"));
      } else {
        pushToast(t("cashuCheckOk"));
      }
    } finally {
      setCashuIsBusy(false);
      setCashuBulkCheckIsBusy(false);
    }
  }, [
    cashuBulkCheckIsBusy,
    cashuIsBusy,
    checkAllCashuTokens,
    pushToast,
    setCashuBulkCheckIsBusy,
    setCashuIsBusy,
    setStatus,
    t,
  ]);

  const requestDeleteCashuToken = React.useCallback(
    (id: CashuTokenId) => {
      if (pendingCashuDeleteId === id) {
        handleDeleteCashuToken(id);
        return;
      }
      setPendingCashuDeleteId(id);
      setStatus(t("deleteArmedHint"));
    },
    [
      handleDeleteCashuToken,
      pendingCashuDeleteId,
      setPendingCashuDeleteId,
      setStatus,
      t,
    ],
  );

  return {
    checkAllCashuTokensAndDeleteInvalid,
    checkAndRefreshCashuToken,
    requestDeleteCashuToken,
  };
};
