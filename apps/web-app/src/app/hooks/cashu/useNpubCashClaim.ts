import * as Evolu from "@evolu/common";
import { Either } from "effect";
import React from "react";
import { parseTokenText } from "@linky/linkshu";
import type { JsonValue } from "../../../types/json";
import {
  LOCAL_NPUB_CASH_CLAIM_LAST_ATTEMPT_STORAGE_KEY_PREFIX,
  LOCAL_NPUB_CASH_CLAIM_LOCK_STORAGE_KEY_PREFIX,
} from "../../../utils/constants";
import type { DisplayAmountParts } from "../../../utils/displayAmounts";
import { extractUniqueClaimTokens } from "../../../utils/npubCashClaimResponse";
import { isNpubCashDisabled } from "../../../utils/npubCashServer";
import type { Route } from "../../../types/route";
import {
  safeLocalStorageGet,
  safeLocalStorageSet,
  withLocalStorageLeaseLock,
} from "../../../utils/storage";
import { getUnknownErrorMessage } from "../../../utils/unknown";
import type {
  LocalMintInfoRow,
  LoggedPaymentEventParams,
} from "../../types/appTypes";
import { describeTaggedCashuError } from "../../lib/cashuStoredError";
import type { ReceiveCashuToken } from "../composition/useLinkshuComposition";

interface UseNpubCashClaimParams {
  cashuIsBusy: boolean;
  currentNpub: string | null;
  currentNsec: string | null;
  enqueueCashuOp: (op: () => Promise<void>) => Promise<void>;
  formatDisplayedAmountParts: (amountSat: number) => DisplayAmountParts;
  isMintDeleted: (mintUrl: string) => boolean;
  logPaymentEvent: (event: LoggedPaymentEventParams) => void;
  makeLocalStorageKey: (prefix: string) => string;
  makeNip98AuthHeader: (
    url: string,
    method: string,
    payload?: Record<string, string>,
  ) => Promise<string>;
  maybeShowPwaNotification: (
    title: string,
    body: string,
    tag?: string,
  ) => Promise<void>;
  mintInfoByUrl: ReadonlyMap<string, LocalMintInfoRow>;
  npubCashServerBaseUrl: string;
  npubCashClaimInFlightRef: React.MutableRefObject<boolean>;
  /** Null until the linkshu runtime is composed (seed + owners resolved). */
  receiveCashuToken: ReceiveCashuToken | null;
  refreshMintInfo: (mintUrl: string) => Promise<void> | void;
  resolveOwnerIdForWrite: () => Promise<Evolu.OwnerId | null>;
  rememberCashuTokenKnown: (...tokens: readonly string[]) => void;
  routeKind: Route["kind"];
  setCashuIsBusy: React.Dispatch<React.SetStateAction<boolean>>;
  setStatus: React.Dispatch<React.SetStateAction<string | null>>;
  showPaidOverlay: (title?: string) => void;
  t: (key: string) => string;
  touchMintInfo: (mintUrl: string, nowSec: number) => void;
}

const NPUB_CASH_CLAIM_IDLE_MIN_INTERVAL_MS = 25_000;
const NPUB_CASH_CLAIM_TOPUP_MIN_INTERVAL_MS = 5_000;
const NPUB_CASH_CLAIM_LOCK_TTL_MS = 20_000;

const makeNpubCashClaimScopedStorageKey = (
  makeLocalStorageKey: (prefix: string) => string,
  prefix: string,
  serverBaseUrl: string,
): string => {
  const serverKey = encodeURIComponent(serverBaseUrl.replace(/\/+$/, ""));
  return makeLocalStorageKey(`${prefix}.${serverKey}`);
};

const readLastClaimAttemptMs = (key: string): number => {
  const raw = safeLocalStorageGet(key);
  if (!raw) return 0;

  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : 0;
};

/**
 * npub.cash claim: fetched tokens are accepted through linkshu `Receive` —
 * the same vertical as pasted tokens — which owns parse/dedup/swap/persist.
 * Only the claim polling, its lock/interval bookkeeping, and the app-side
 * notifications live here. Transient accept failures persist no row; the
 * next claim poll simply retries the token.
 */
export const useNpubCashClaim = ({
  cashuIsBusy,
  currentNpub,
  currentNsec,
  enqueueCashuOp,
  formatDisplayedAmountParts,
  isMintDeleted,
  logPaymentEvent,
  makeLocalStorageKey,
  makeNip98AuthHeader,
  maybeShowPwaNotification,
  mintInfoByUrl,
  npubCashServerBaseUrl,
  npubCashClaimInFlightRef,
  receiveCashuToken,
  refreshMintInfo,
  resolveOwnerIdForWrite,
  rememberCashuTokenKnown,
  routeKind,
  setCashuIsBusy,
  setStatus,
  showPaidOverlay,
  t,
  touchMintInfo,
}: UseNpubCashClaimParams) => {
  const acceptAndStoreCashuToken = React.useCallback(
    async (tokenText: string) => {
      const tokenRaw = tokenText.trim();
      if (!tokenRaw) return;
      if (receiveCashuToken === null) return;

      await enqueueCashuOp(async () => {
        setCashuIsBusy(true);

        const parsed = parseTokenText(tokenRaw);
        const parsedMint = parsed?.mint ?? null;
        const parsedAmount = parsed?.amount ?? null;
        const logFailure = (message: string): void => {
          logPaymentEvent({
            direction: "in",
            status: "error",
            amount: parsedAmount,
            fee: null,
            mint: parsedMint,
            unit: null,
            error: message,
            contactId: null,
            method: "cashu_receive",
            phase: "receive",
          });
        };

        try {
          const outcome = await receiveCashuToken(tokenRaw);

          if (Either.isLeft(outcome)) {
            const error = outcome.left;
            if (error._tag === "TokenAlreadyKnown") return;
            const message = describeTaggedCashuError(error) ?? error._tag;
            logFailure(message);
            setStatus(`${t("cashuAcceptFailed")}: ${message}`);
            return;
          }

          const receipt = outcome.right;
          rememberCashuTokenKnown(tokenRaw, receipt.tokenText);

          const cleanedMint = String(receipt.mint).trim().replace(/\/+$/, "");
          if (cleanedMint && !isMintDeleted(cleanedMint)) {
            const nowSec = Math.floor(Date.now() / 1000);
            const existing = mintInfoByUrl.get(cleanedMint);
            touchMintInfo(cleanedMint, nowSec);

            const lastChecked = Number(existing?.lastCheckedAtSec ?? 0) || 0;
            if (existing && !lastChecked) void refreshMintInfo(cleanedMint);
          }

          logPaymentEvent({
            direction: "in",
            status: "ok",
            amount: receipt.amount,
            fee: null,
            mint: receipt.mint,
            unit: receipt.unit,
            error: null,
            contactId: null,
            method: "cashu_receive",
            phase: "receive",
          });

          const displayAmount =
            receipt.amount > 0
              ? formatDisplayedAmountParts(receipt.amount)
              : null;

          if (routeKind !== "topupInvoice") {
            showPaidOverlay(
              displayAmount === null
                ? t("cashuAccepted")
                : t("paidReceived")
                    .replace(
                      "{amount}",
                      `${displayAmount.approxPrefix}${displayAmount.amountText}`,
                    )
                    .replace("{unit}", displayAmount.unitLabel),
            );
          }

          void maybeShowPwaNotification(
            t("mints"),
            displayAmount === null
              ? t("cashuAccepted")
              : `${displayAmount.approxPrefix}${displayAmount.amountText} ${displayAmount.unitLabel}`,
            "cashu_claim",
          );
        } catch (error) {
          const message = getUnknownErrorMessage(error, "Accept failed");
          logFailure(message);
          setStatus(`${t("cashuAcceptFailed")}: ${message}`);
        } finally {
          setCashuIsBusy(false);
        }
      });
    },
    [
      enqueueCashuOp,
      formatDisplayedAmountParts,
      isMintDeleted,
      logPaymentEvent,
      maybeShowPwaNotification,
      mintInfoByUrl,
      receiveCashuToken,
      refreshMintInfo,
      rememberCashuTokenKnown,
      routeKind,
      setCashuIsBusy,
      setStatus,
      showPaidOverlay,
      t,
      touchMintInfo,
    ],
  );

  const claimNpubCashOnce = React.useCallback(async () => {
    // Don't claim while we are paying/accepting, otherwise we risk consuming
    // the claim response and then skipping token processing.
    if (isNpubCashDisabled()) return;
    if (cashuIsBusy) return;
    if (!currentNpub) return;
    if (!currentNsec) return;
    if (receiveCashuToken === null) return;
    if (npubCashClaimInFlightRef.current) return;
    if (!(await resolveOwnerIdForWrite())) return;

    try {
      const lockKey = makeNpubCashClaimScopedStorageKey(
        makeLocalStorageKey,
        LOCAL_NPUB_CASH_CLAIM_LOCK_STORAGE_KEY_PREFIX,
        npubCashServerBaseUrl,
      );
      const lastAttemptKey = makeNpubCashClaimScopedStorageKey(
        makeLocalStorageKey,
        LOCAL_NPUB_CASH_CLAIM_LAST_ATTEMPT_STORAGE_KEY_PREFIX,
        npubCashServerBaseUrl,
      );

      await withLocalStorageLeaseLock({
        key: lockKey,
        timeoutMs: 0,
        ttlMs: NPUB_CASH_CLAIM_LOCK_TTL_MS,
        fn: async () => {
          if (npubCashClaimInFlightRef.current) return;

          const nowMs = Date.now();
          const minIntervalMs =
            routeKind === "topupInvoice"
              ? NPUB_CASH_CLAIM_TOPUP_MIN_INTERVAL_MS
              : NPUB_CASH_CLAIM_IDLE_MIN_INTERVAL_MS;
          const lastAttemptMs = readLastClaimAttemptMs(lastAttemptKey);
          if (nowMs - lastAttemptMs < minIntervalMs) return;
          safeLocalStorageSet(lastAttemptKey, String(nowMs));

          npubCashClaimInFlightRef.current = true;
          try {
            const url = `${npubCashServerBaseUrl}/api/v1/claim`;
            const auth = await makeNip98AuthHeader(url, "GET");
            const res = await fetch(url, {
              method: "GET",
              headers: { Authorization: auth },
            });
            if (!res.ok) return;
            const json = (await res.json()) as JsonValue;
            const tokens = extractUniqueClaimTokens(json);
            if (tokens.length === 0) return;

            for (const tokenText of tokens) {
              await acceptAndStoreCashuToken(tokenText);
            }
          } finally {
            npubCashClaimInFlightRef.current = false;
          }
        },
      });
    } catch {
      // ignore
    }
  }, [
    acceptAndStoreCashuToken,
    cashuIsBusy,
    currentNpub,
    currentNsec,
    makeLocalStorageKey,
    makeNip98AuthHeader,
    npubCashServerBaseUrl,
    npubCashClaimInFlightRef,
    receiveCashuToken,
    resolveOwnerIdForWrite,
    routeKind,
  ]);

  const claimNpubCashOnceLatestRef = React.useRef(claimNpubCashOnce);
  React.useEffect(() => {
    claimNpubCashOnceLatestRef.current = claimNpubCashOnce;
  }, [claimNpubCashOnce]);

  return {
    claimNpubCashOnce,
    claimNpubCashOnceLatestRef,
  };
};
