import * as Evolu from "@evolu/common";
import React from "react";
import { parseCashuToken } from "../../../cashu";
import { navigateTo } from "../../../hooks/useRouting";
import type { DisplayAmountParts } from "../../../utils/displayAmounts";
import { getUnknownErrorMessage } from "../../../utils/unknown";
import type {
  LoggedPaymentEventParams,
  OptionalNumber,
  OptionalText,
} from "../../types/appTypes";
import {
  buildSparseCashuTokenPayload,
  createCashuTokenId,
} from "../../lib/cashuTokenIdentity";
import { isUnknownContactId } from "../messages/contactIdentity";
import { createDefaultCashuTokenAcceptor } from "./acceptAndPersistCashuToken";

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
  refreshMintInfo: (mintUrl: string) => Promise<void>;
  resolveOwnerIdForWrite: () => Promise<Evolu.OwnerId | null>;
  rememberCashuTokenKnown: (...tokens: readonly string[]) => void;
  setCashuDraft: React.Dispatch<React.SetStateAction<string>>;
  setCashuIsBusy: React.Dispatch<React.SetStateAction<boolean>>;
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
  refreshMintInfo,
  resolveOwnerIdForWrite,
  rememberCashuTokenKnown,
  setCashuDraft,
  setCashuIsBusy,
  setStatus,
  showPaidOverlay,
  t,
  touchMintInfo,
}: UseSaveCashuFromTextParams) => {
  const acceptAndPersistCashuToken = React.useMemo(
    () =>
      createDefaultCashuTokenAcceptor({
        ensureCashuTokenPersisted,
        rememberCashuTokenKnown,
        upsert,
      }),
    [ensureCashuTokenPersisted, rememberCashuTokenKnown, upsert],
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
          const result = await acceptAndPersistCashuToken({
            tokenText: tokenRaw,
            isAlreadyStored: isCashuTokenStored,
            isAcceptedAlreadyStored: (rawToken, acceptedToken) =>
              isCashuTokenStored(rawToken) ||
              (acceptedToken !== "" && isCashuTokenStored(acceptedToken)),
            resolveOwnerBeforeDuplicateCheck: true,
            resolveOwnerId: resolveOwnerIdForWrite,
          });

          if (result.status === "empty") return;
          if (result.status === "storage-unavailable") {
            setStatus(`${t("errorPrefix")}: Cashu storage is not ready`);
            return;
          }
          if (result.status === "duplicate-before-accept") {
            setStatus(t("cashuExists"));
            return;
          }
          if (result.status === "duplicate-after-accept") {
            setStatus(t("cashuExists"));
            if (options?.navigateToTokens) {
              navigateTo({ route: "cashuTokens" });
            } else if (options?.navigateToWallet) {
              navigateTo({ route: "wallet" });
            }
            return;
          }
          if (result.status === "persist-failed") {
            setStatus(`${t("errorPrefix")}: ${result.error}`);
            return;
          }
          if (result.status === "accept-failed") {
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
              error: result.error,
              method: "cashu_receive",
              phase: "receive",
            });
            setStatus(
              result.persistenceError
                ? `${t("errorPrefix")}: ${result.persistenceError}`
                : `${t("cashuAcceptFailed")}: ${result.error}`,
            );
            return;
          }

          const accepted = result.accepted;
          const acceptedToken = String(accepted.token ?? "").trim();

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
            buildSparseCashuTokenPayload({
              id: createCashuTokenId(tokenRaw),
              token: tokenRaw,
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
      acceptAndPersistCashuToken,
      enqueueCashuOp,
      formatDisplayedAmountParts,
      upsert,
      isCashuTokenStored,
      isMintDeleted,
      logPaymentEvent,
      mintInfoByUrl,
      refreshMintInfo,
      resolveOwnerIdForWrite,
      setCashuDraft,
      setCashuIsBusy,
      setStatus,
      showPaidOverlay,
      t,
      touchMintInfo,
    ],
  );
};
