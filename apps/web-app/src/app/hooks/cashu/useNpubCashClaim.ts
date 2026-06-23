import * as Evolu from "@evolu/common";
import React from "react";
import { parseCashuToken } from "../../../cashu";
import { acceptCashuToken } from "../../../cashuAccept";
import type { JsonValue } from "../../../types/json";
import type { Route } from "../../../types/route";
import { LAST_ACCEPTED_CASHU_TOKEN_STORAGE_KEY } from "../../../utils/constants";
import type { DisplayAmountParts } from "../../../utils/displayAmounts";
import { extractUniqueClaimTokens } from "../../../utils/npubCashClaimResponse";
import { safeLocalStorageSet } from "../../../utils/storage";
import { getUnknownErrorMessage } from "../../../utils/unknown";
import type {
  CashuTokenRowLike,
  LocalMintInfoRow,
  LoggedPaymentEventParams,
} from "../../types/appTypes";
import {
  createCashuTokenId,
  hasMatchingCashuToken,
} from "../../lib/cashuTokenIdentity";

type EvoluMutations = ReturnType<typeof import("../../../evolu").useEvolu>;

interface UseNpubCashClaimParams {
  cashuIsBusy: boolean;
  cashuTokensAll: readonly CashuTokenRowLike[];
  currentNpub: string | null;
  currentNsec: string | null;
  enqueueCashuOp: (op: () => Promise<void>) => Promise<void>;
  ensureCashuTokenPersisted: (token: string) => void;
  formatDisplayedAmountParts: (amountSat: number) => DisplayAmountParts;
  upsert: EvoluMutations["upsert"];
  isMintDeleted: (mintUrl: string) => boolean;
  logPaymentEvent: (event: LoggedPaymentEventParams) => void;
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
  recentlyReceivedTokenTimerRef: React.MutableRefObject<number | null>;
  refreshMintInfo: (mintUrl: string) => Promise<void> | void;
  resolveOwnerIdForWrite: () => Promise<Evolu.OwnerId | null>;
  rememberCashuTokenKnown: (...tokens: readonly string[]) => void;
  routeKind: Route["kind"];
  setCashuIsBusy: React.Dispatch<React.SetStateAction<boolean>>;
  setRecentlyReceivedToken: React.Dispatch<
    React.SetStateAction<null | { amount: number | null; token: string }>
  >;
  setStatus: React.Dispatch<React.SetStateAction<string | null>>;
  showPaidOverlay: (title?: string) => void;
  t: (key: string) => string;
  touchMintInfo: (mintUrl: string, nowSec: number) => void;
}

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
  makeNip98AuthHeader,
  maybeShowPwaNotification,
  mintInfoByUrl,
  npubCashServerBaseUrl,
  npubCashClaimInFlightRef,
  recentlyReceivedTokenTimerRef,
  refreshMintInfo,
  resolveOwnerIdForWrite,
  rememberCashuTokenKnown,
  routeKind,
  setCashuIsBusy,
  setRecentlyReceivedToken,
  setStatus,
  showPaidOverlay,
  t,
  touchMintInfo,
}: UseNpubCashClaimParams) => {
  const buildCashuTokenPayload = React.useCallback(
    (args: {
      amount: number | null;
      error: string | null;
      mint: string | null;
      identityToken: string;
      state: "accepted" | "error";
      token: string;
      unit: string | null;
    }) => {
      const payload: {
        id: ReturnType<typeof createCashuTokenId>;
        token: typeof Evolu.NonEmptyString.Type;
        state: typeof Evolu.NonEmptyString100.Type;
        error?: typeof Evolu.NonEmptyString1000.Type;
      } = {
        id: createCashuTokenId(args.identityToken),
        token: args.token as typeof Evolu.NonEmptyString.Type,
        state: args.state as typeof Evolu.NonEmptyString100.Type,
      };

      const error = String(args.error ?? "").trim();
      if (error) {
        payload.error = error.slice(
          0,
          1000,
        ) as typeof Evolu.NonEmptyString1000.Type;
      }

      return payload;
    },
    [],
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
          // De-dupe: don't accept/store the same token twice.
          const alreadyStored = hasMatchingCashuToken(cashuTokensAll, {
            token: tokenRaw,
          });
          if (alreadyStored) return;

          const ownerId = await resolveOwnerIdForWrite();
          if (!ownerId) {
            setStatus(`${t("errorPrefix")}: Cashu storage is not ready`);
            return;
          }

          const accepted = await acceptCashuToken(tokenRaw);
          const acceptedToken = String(accepted.token ?? "").trim();

          if (acceptedToken) {
            safeLocalStorageSet(
              LAST_ACCEPTED_CASHU_TOKEN_STORAGE_KEY,
              acceptedToken,
            );
          }

          const result = upsert(
            "cashuToken",
            buildCashuTokenPayload({
              token: acceptedToken,
              identityToken: tokenRaw,
              mint: String(accepted.mint ?? ""),
              unit: accepted.unit,
              amount: accepted.amount > 0 ? accepted.amount : null,
              state: "accepted",
              error: null,
            }),
            { ownerId },
          );
          if (!result.ok) {
            setStatus(
              `${t("errorPrefix")}: ${getUnknownErrorMessage(result.error, "unknown")}`,
            );
            return;
          }

          rememberCashuTokenKnown(tokenRaw, acceptedToken);
          // Remember the last successfully accepted token so we can recover it
          // if storage gets wiped (e.g., private browsing) or if persistence
          // glitches.
          safeLocalStorageSet(
            LAST_ACCEPTED_CASHU_TOKEN_STORAGE_KEY,
            acceptedToken,
          );
          ensureCashuTokenPersisted(acceptedToken);

          // Minimal receive-only banner shown after a token is accepted.
          if (recentlyReceivedTokenTimerRef.current !== null) {
            try {
              window.clearTimeout(recentlyReceivedTokenTimerRef.current);
            } catch {
              // ignore
            }
          }
          setRecentlyReceivedToken({
            token: acceptedToken,
            amount:
              typeof accepted.amount === "number" && accepted.amount > 0
                ? accepted.amount
                : null,
          });
          recentlyReceivedTokenTimerRef.current = window.setTimeout(() => {
            setRecentlyReceivedToken(null);
            recentlyReceivedTokenTimerRef.current = null;
          }, 25_000);

          const cleanedMint = String(accepted.mint ?? "")
            .trim()
            .replace(/\/+$/, "");
          if (cleanedMint) {
            const nowSec = Math.floor(Date.now() / 1000);
            const existing = mintInfoByUrl.get(cleanedMint);

            if (isMintDeleted(cleanedMint)) {
              // Respect user deletion across any owner scope.
            } else {
              touchMintInfo(cleanedMint, nowSec);

              const lastChecked = Number(existing?.lastCheckedAtSec ?? 0) || 0;
              if (existing && !lastChecked) void refreshMintInfo(cleanedMint);
            }
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
              buildCashuTokenPayload({
                token: tokenRaw,
                identityToken: tokenRaw,
                mint: parsedMint,
                unit: null,
                amount: typeof parsedAmount === "number" ? parsedAmount : null,
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
      enqueueCashuOp,
      ensureCashuTokenPersisted,
      formatDisplayedAmountParts,
      upsert,
      isMintDeleted,
      buildCashuTokenPayload,
      logPaymentEvent,
      maybeShowPwaNotification,
      mintInfoByUrl,
      refreshMintInfo,
      resolveOwnerIdForWrite,
      rememberCashuTokenKnown,
      routeKind,
      setCashuIsBusy,
      setRecentlyReceivedToken,
      setStatus,
      showPaidOverlay,
      t,
      touchMintInfo,
      recentlyReceivedTokenTimerRef,
    ],
  );

  const claimNpubCashOnce = React.useCallback(async () => {
    // Don't claim while we are paying/accepting, otherwise we risk consuming
    // the claim response and then skipping token processing.
    if (cashuIsBusy) return;
    if (!currentNpub) return;
    if (!currentNsec) return;
    if (npubCashClaimInFlightRef.current) return;
    if (!(await resolveOwnerIdForWrite())) return;

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
    } catch {
      // ignore
    } finally {
      npubCashClaimInFlightRef.current = false;
    }
  }, [
    acceptAndStoreCashuToken,
    cashuIsBusy,
    currentNpub,
    currentNsec,
    makeNip98AuthHeader,
    npubCashServerBaseUrl,
    npubCashClaimInFlightRef,
    resolveOwnerIdForWrite,
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
