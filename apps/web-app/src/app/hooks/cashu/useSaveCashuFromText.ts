import * as Evolu from "@evolu/common";
import React from "react";
import { parseCashuToken } from "../../../cashu";
import { acceptCashuToken } from "../../../cashuAccept";
import { navigateTo } from "../../../hooks/useRouting";
import { LAST_ACCEPTED_CASHU_TOKEN_STORAGE_KEY } from "../../../utils/constants";
import type { DisplayAmountParts } from "../../../utils/displayAmounts";
import { safeLocalStorageSet } from "../../../utils/storage";
import { getUnknownErrorMessage } from "../../../utils/unknown";
import type {
  LoggedPaymentEventParams,
  OptionalNumber,
  OptionalText,
} from "../../types/appTypes";
import { createCashuTokenId } from "../../lib/cashuTokenIdentity";
import { isUnknownContactId } from "../messages/contactIdentity";

type EvoluMutations = ReturnType<typeof import("../../../evolu").useEvolu>;

interface CashuTokenMetaRow {
  id: string;
  isDeleted?: OptionalText;
  lastCheckedAtSec?: OptionalNumber;
}

interface UseSaveCashuFromTextParams {
  enqueueCashuOp: (op: () => Promise<void>) => Promise<void>;
  ensureCashuTokenPersisted: (token: string) => void;
  formatDisplayedAmountParts: (amountSat: number) => DisplayAmountParts;
  upsert: EvoluMutations["upsert"];
  isCashuTokenStored: (tokenRaw: string) => boolean;
  isMintDeleted: (mintUrl: string) => boolean;
  logPaymentEvent: (event: LoggedPaymentEventParams) => void;
  mintInfoByUrl: Map<string, CashuTokenMetaRow>;
  recentlyReceivedTokenTimerRef: React.MutableRefObject<number | null>;
  refreshMintInfo: (mintUrl: string) => Promise<void>;
  resolveOwnerIdForWrite: () => Promise<Evolu.OwnerId | null>;
  rememberCashuTokenKnown: (...tokens: readonly string[]) => void;
  setCashuDraft: React.Dispatch<React.SetStateAction<string>>;
  setCashuIsBusy: React.Dispatch<React.SetStateAction<boolean>>;
  setRecentlyReceivedToken: React.Dispatch<
    React.SetStateAction<{ amount: number | null; token: string } | null>
  >;
  setStatus: React.Dispatch<React.SetStateAction<string | null>>;
  showPaidOverlay: (title?: string) => void;
  t: (key: string) => string;
  touchMintInfo: (mintUrl: string, nowSec: number) => void;
}

export const useSaveCashuFromText = ({
  enqueueCashuOp,
  ensureCashuTokenPersisted,
  formatDisplayedAmountParts,
  upsert,
  isCashuTokenStored,
  isMintDeleted,
  logPaymentEvent,
  mintInfoByUrl,
  recentlyReceivedTokenTimerRef,
  refreshMintInfo,
  resolveOwnerIdForWrite,
  rememberCashuTokenKnown,
  setCashuDraft,
  setCashuIsBusy,
  setRecentlyReceivedToken,
  setStatus,
  showPaidOverlay,
  t,
  touchMintInfo,
}: UseSaveCashuFromTextParams) => {
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

  return React.useCallback(
    async (
      tokenText: string,
      options?: {
        contactId?: string;
        navigateToTokens?: boolean;
        navigateToWallet?: boolean;
        requestId?: string;
      },
    ) => {
      const tokenRaw = tokenText.trim();
      if (!tokenRaw) {
        setStatus(t("pasteEmpty"));
        return;
      }
      if (isCashuTokenStored(tokenRaw)) {
        setStatus(t("cashuExists"));
        if (options?.navigateToTokens) {
          navigateTo({ route: "cashuTokens" });
        } else if (options?.navigateToWallet) {
          navigateTo({ route: "wallet" });
        }
        return;
      }
      setCashuDraft("");
      setStatus(t("cashuAccepting"));

      // Parse best-effort metadata for display / fallback.
      const parsed = parseCashuToken(tokenRaw);
      const parsedMint = parsed?.mint?.trim() ? parsed.mint.trim() : null;
      const parsedAmount =
        parsed?.amount && parsed.amount > 0 ? parsed.amount : null;
      const optionContactId = String(options?.contactId ?? "").trim();
      const unknownContactId = isUnknownContactId(optionContactId)
        ? optionContactId
        : null;
      const paymentContactId = unknownContactId
        ? null
        : optionContactId || null;

      await enqueueCashuOp(async () => {
        setCashuIsBusy(true);
        try {
          const ownerId = await resolveOwnerIdForWrite();
          if (!ownerId) {
            setStatus(`${t("errorPrefix")}: Cashu storage is not ready`);
            return;
          }
          if (isCashuTokenStored(tokenRaw)) {
            setStatus(t("cashuExists"));
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

          if (
            isCashuTokenStored(tokenRaw) ||
            (acceptedToken !== "" && isCashuTokenStored(acceptedToken))
          ) {
            setStatus(t("cashuExists"));
            if (options?.navigateToTokens) {
              navigateTo({ route: "cashuTokens" });
            } else if (options?.navigateToWallet) {
              navigateTo({ route: "wallet" });
            }
            return;
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
          safeLocalStorageSet(
            LAST_ACCEPTED_CASHU_TOKEN_STORAGE_KEY,
            acceptedToken,
          );
          ensureCashuTokenPersisted(acceptedToken);

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
            contactId: paymentContactId,
            details: {
              acceptedToken,
              rawToken: tokenRaw,
              ...(unknownContactId ? { unknownContactId } : {}),
              ...(options?.requestId ? { requestId: options.requestId } : {}),
            },
            fee: null,
            mint: accepted.mint,
            unit: accepted.unit,
            error: null,
            method: "cashu_receive",
            phase: "receive",
          });

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

          if (options?.navigateToTokens) {
            navigateTo({ route: "cashuTokens" });
          } else if (options?.navigateToWallet) {
            navigateTo({ route: "wallet" });
          }
        } catch (error) {
          const message = getUnknownErrorMessage(error, "Accept failed");
          logPaymentEvent({
            direction: "in",
            status: "error",
            amount: parsedAmount,
            contactId: paymentContactId,
            details: {
              rawToken: tokenRaw,
              ...(unknownContactId ? { unknownContactId } : {}),
              ...(options?.requestId ? { requestId: options.requestId } : {}),
            },
            fee: null,
            mint: parsedMint,
            unit: null,
            error: message,
            method: "cashu_receive",
            phase: "receive",
          });
          const ownerId = await resolveOwnerIdForWrite();
          if (!ownerId) {
            setStatus(`${t("cashuAcceptFailed")}: ${message}`);
            return;
          }
          const result = upsert(
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
          if (result.ok) {
            setStatus(`${t("cashuAcceptFailed")}: ${message}`);
          } else {
            setStatus(
              `${t("errorPrefix")}: ${getUnknownErrorMessage(result.error, "unknown")}`,
            );
          }
        } finally {
          setCashuIsBusy(false);
        }
      });
    },
    [
      enqueueCashuOp,
      ensureCashuTokenPersisted,
      formatDisplayedAmountParts,
      upsert,
      isCashuTokenStored,
      isMintDeleted,
      logPaymentEvent,
      mintInfoByUrl,
      refreshMintInfo,
      recentlyReceivedTokenTimerRef,
      resolveOwnerIdForWrite,
      rememberCashuTokenKnown,
      setCashuDraft,
      setCashuIsBusy,
      setRecentlyReceivedToken,
      setStatus,
      showPaidOverlay,
      t,
      touchMintInfo,
      buildCashuTokenPayload,
    ],
  );
};
