import * as Evolu from "@evolu/common";
import React from "react";
import { parseCashuToken } from "../../../cashu";
import type { CashuTokenRow } from "../../../evolu";
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
import {
  buildSparseCashuTokenPayload,
  createCashuTokenId,
  hasMatchingCashuToken,
} from "../../lib/cashuTokenIdentity";
import { createDefaultCashuTokenAcceptor } from "./acceptAndPersistCashuToken";

type EvoluMutations = ReturnType<typeof import("../../../evolu").useEvolu>;

interface UseNpubCashClaimParams {
  cashuIsBusy: boolean;
  cashuTokensAll: readonly CashuTokenRow[];
  currentNpub: string | null;
  currentNsec: string | null;
  enqueueCashuOp: (op: () => Promise<void>) => Promise<void>;
  ensureCashuTokenPersisted: (token: string) => void;
  formatDisplayedAmountParts: (amountSat: number) => DisplayAmountParts;
  upsert: EvoluMutations["upsert"];
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

export const useNpubCashClaim = ({
  cashuIsBusy,
  cashuTokensAll,
  currentNpub,
  currentNsec,
  enqueueCashuOp,
  ensureCashuTokenPersisted,
  formatDisplayedAmountParts,
  upsert,
  isMintDeleted,
  logPaymentEvent,
  makeLocalStorageKey,
  makeNip98AuthHeader,
  maybeShowPwaNotification,
  mintInfoByUrl,
  npubCashServerBaseUrl,
  npubCashClaimInFlightRef,
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
  const acceptAndPersistCashuToken = React.useMemo(
    () =>
      createDefaultCashuTokenAcceptor({
        ensureCashuTokenPersisted,
        rememberCashuTokenKnown,
        upsert,
      }),
    [ensureCashuTokenPersisted, rememberCashuTokenKnown, upsert],
  );

  const acceptAndStoreCashuToken = React.useCallback(
    async (tokenText: string) => {
      const tokenRaw = tokenText.trim();
      if (!tokenRaw) return;

      await enqueueCashuOp(async () => {
        setCashuIsBusy(true);

        const parsed = parseCashuToken(tokenRaw);
        const parsedMint = parsed?.mint?.trim() ? parsed.mint.trim() : null;
        const parsedAmount =
          parsed?.amount && parsed.amount > 0 ? parsed.amount : null;

        try {
          const result = await acceptAndPersistCashuToken({
            tokenText: tokenRaw,
            isAlreadyStored: (token) =>
              hasMatchingCashuToken(cashuTokensAll, { token }),
            resolveOwnerId: resolveOwnerIdForWrite,
          });

          if (
            result.status === "empty" ||
            result.status === "duplicate-before-accept"
          ) {
            return;
          }
          if (result.status === "storage-unavailable") {
            setStatus(`${t("errorPrefix")}: Cashu storage is not ready`);
            return;
          }
          if (result.status === "persist-failed") {
            setStatus(`${t("errorPrefix")}: ${result.error}`);
            return;
          }
          if (result.status === "accept-failed") {
            const message = result.error;
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
            setStatus(`${t("cashuAcceptFailed")}: ${message}`);
            return;
          }

          const accepted = result.accepted;
          const cleanedMint = String(accepted.mint ?? "")
            .trim()
            .replace(/\/+$/, "");
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
            amount: accepted.amount,
            fee: null,
            mint: accepted.mint,
            unit: accepted.unit,
            error: null,
            contactId: null,
            method: "cashu_receive",
            phase: "receive",
          });

          if (routeKind !== "topupInvoice") {
            const title =
              accepted.amount && accepted.amount > 0
                ? (() => {
                    const displayAmount = formatDisplayedAmountParts(
                      accepted.amount,
                    );
                    return t("paidReceived")
                      .replace(
                        "{amount}",
                        `${displayAmount.approxPrefix}${displayAmount.amountText}`,
                      )
                      .replace("{unit}", displayAmount.unitLabel);
                  })()
                : t("cashuAccepted");
            showPaidOverlay(title);
          }

          const body =
            accepted.amount && accepted.amount > 0
              ? (() => {
                  const displayAmount = formatDisplayedAmountParts(
                    accepted.amount,
                  );
                  return `${displayAmount.approxPrefix}${displayAmount.amountText} ${displayAmount.unitLabel}`;
                })()
              : t("cashuAccepted");
          void maybeShowPwaNotification(t("mints"), body, "cashu_claim");
        } catch (error) {
          const message = getUnknownErrorMessage(error, "Accept failed");
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

          const ownerId = await resolveOwnerIdForWrite();
          if (ownerId) {
            upsert(
              "cashuToken",
              buildSparseCashuTokenPayload({
                id: createCashuTokenId(tokenRaw),
                token: tokenRaw,
                state: "error",
                error: message,
              }),
              { ownerId },
            );
          }
          setStatus(`${t("cashuAcceptFailed")}: ${message}`);
        } finally {
          setCashuIsBusy(false);
        }
      });
    },
    [
      cashuTokensAll,
      acceptAndPersistCashuToken,
      enqueueCashuOp,
      formatDisplayedAmountParts,
      upsert,
      isMintDeleted,
      logPaymentEvent,
      maybeShowPwaNotification,
      mintInfoByUrl,
      refreshMintInfo,
      resolveOwnerIdForWrite,
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
