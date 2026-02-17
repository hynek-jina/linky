import * as Evolu from "@evolu/common";
import React from "react";
import { parseCashuToken } from "../../../cashu";
import { acceptCashuToken } from "../../../cashuAccept";
import type { ContactId } from "../../../evolu";
import { navigateTo } from "../../../hooks/useRouting";
import { LAST_ACCEPTED_CASHU_TOKEN_STORAGE_KEY } from "../../../utils/constants";
import { safeLocalStorageSet } from "../../../utils/storage";
import type { OptionalNumber, OptionalText } from "../../types/appTypes";

type EvoluMutations = ReturnType<typeof import("../../../evolu").useEvolu>;

interface CashuTokenMetaRow {
  id: string;
  isDeleted?: OptionalText;
  lastCheckedAtSec?: OptionalNumber;
}

interface UseSaveCashuFromTextParams {
  displayUnit: string;
  enqueueCashuOp: (op: () => Promise<void>) => Promise<void>;
  ensureCashuTokenPersisted: (token: string) => void;
  formatInteger: (value: number) => string;
  insert: EvoluMutations["insert"];
  isCashuTokenStored: (tokenRaw: string) => boolean;
  isMintDeleted: (mintUrl: string) => boolean;
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
  mintInfoByUrl: Map<string, CashuTokenMetaRow>;
  recentlyReceivedTokenTimerRef: React.MutableRefObject<number | null>;
  refreshMintInfo: (mintUrl: string) => Promise<void>;
  resolveOwnerIdForWrite: () => Promise<Evolu.OwnerId | null>;
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
  displayUnit,
  enqueueCashuOp,
  ensureCashuTokenPersisted,
  formatInteger,
  insert,
  isCashuTokenStored,
  isMintDeleted,
  logPaymentEvent,
  mintInfoByUrl,
  recentlyReceivedTokenTimerRef,
  refreshMintInfo,
  resolveOwnerIdForWrite,
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
      rawToken: string;
      state: "accepted" | "error";
      token: string;
      unit: string | null;
    }) => {
      const payload: {
        token: typeof Evolu.NonEmptyString.Type;
        state: typeof Evolu.NonEmptyString100.Type;
        amount?: typeof Evolu.PositiveInt.Type;
        error?: typeof Evolu.NonEmptyString1000.Type;
        mint?: typeof Evolu.NonEmptyString1000.Type;
        rawToken?: typeof Evolu.NonEmptyString.Type;
        unit?: typeof Evolu.NonEmptyString100.Type;
      } = {
        token: args.token as typeof Evolu.NonEmptyString.Type,
        state: args.state as typeof Evolu.NonEmptyString100.Type,
      };

      const rawToken = String(args.rawToken ?? "").trim();
      if (rawToken)
        payload.rawToken = rawToken as typeof Evolu.NonEmptyString.Type;

      const mint = String(args.mint ?? "").trim();
      if (mint) payload.mint = mint as typeof Evolu.NonEmptyString1000.Type;

      const unit = String(args.unit ?? "").trim();
      if (unit) payload.unit = unit as typeof Evolu.NonEmptyString100.Type;

      if (typeof args.amount === "number" && args.amount > 0) {
        payload.amount = args.amount as typeof Evolu.PositiveInt.Type;
      }

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
        navigateToWallet?: boolean;
      },
    ) => {
      const tokenRaw = tokenText.trim();
      if (!tokenRaw) {
        setStatus(t("pasteEmpty"));
        return;
      }
      if (isCashuTokenStored(tokenRaw)) return;
      setCashuDraft("");
      setStatus(t("cashuAccepting"));

      // Parse best-effort metadata for display / fallback.
      const parsed = parseCashuToken(tokenRaw);
      const parsedMint = parsed?.mint?.trim() ? parsed.mint.trim() : null;
      const parsedAmount =
        parsed?.amount && parsed.amount > 0 ? parsed.amount : null;

      await enqueueCashuOp(async () => {
        setCashuIsBusy(true);
        try {
          const ownerId = await resolveOwnerIdForWrite();

          const accepted = await acceptCashuToken(tokenRaw);

          const result = ownerId
            ? insert(
                "cashuToken",
                buildCashuTokenPayload({
                  token: String(accepted.token ?? ""),
                  rawToken: tokenRaw,
                  mint: String(accepted.mint ?? ""),
                  unit: accepted.unit,
                  amount: accepted.amount > 0 ? accepted.amount : null,
                  state: "accepted",
                  error: null,
                }),
                { ownerId },
              )
            : insert(
                "cashuToken",
                buildCashuTokenPayload({
                  token: String(accepted.token ?? ""),
                  rawToken: tokenRaw,
                  mint: String(accepted.mint ?? ""),
                  unit: accepted.unit,
                  amount: accepted.amount > 0 ? accepted.amount : null,
                  state: "accepted",
                  error: null,
                }),
              );
          if (!result.ok) {
            setStatus(`${t("errorPrefix")}: ${String(result.error)}`);
            return;
          }

          safeLocalStorageSet(
            LAST_ACCEPTED_CASHU_TOKEN_STORAGE_KEY,
            String(accepted.token ?? ""),
          );
          ensureCashuTokenPersisted(String(accepted.token ?? ""));

          if (recentlyReceivedTokenTimerRef.current !== null) {
            try {
              window.clearTimeout(recentlyReceivedTokenTimerRef.current);
            } catch {
              // ignore
            }
          }
          setRecentlyReceivedToken({
            token: String(accepted.token ?? "").trim(),
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
          });

          const title =
            accepted.amount && accepted.amount > 0
              ? t("paidReceived")
                  .replace("{amount}", formatInteger(accepted.amount))
                  .replace("{unit}", displayUnit)
              : t("cashuAccepted");
          showPaidOverlay(title);

          if (options?.navigateToWallet) {
            navigateTo({ route: "wallet" });
          }
        } catch (error) {
          const message = String(error).trim() || "Accept failed";
          logPaymentEvent({
            direction: "in",
            status: "error",
            amount: parsedAmount,
            fee: null,
            mint: parsedMint,
            unit: null,
            error: message,
            contactId: null,
          });
          const ownerId = await resolveOwnerIdForWrite();
          const result = ownerId
            ? insert(
                "cashuToken",
                buildCashuTokenPayload({
                  token: tokenRaw,
                  rawToken: tokenRaw,
                  mint: parsedMint,
                  unit: null,
                  amount:
                    typeof parsedAmount === "number" ? parsedAmount : null,
                  state: "error",
                  error: message,
                }),
                { ownerId },
              )
            : insert(
                "cashuToken",
                buildCashuTokenPayload({
                  token: tokenRaw,
                  rawToken: tokenRaw,
                  mint: parsedMint,
                  unit: null,
                  amount:
                    typeof parsedAmount === "number" ? parsedAmount : null,
                  state: "error",
                  error: message,
                }),
              );
          if (result.ok) {
            setStatus(`${t("cashuAcceptFailed")}: ${message}`);
          } else {
            setStatus(`${t("errorPrefix")}: ${String(result.error)}`);
          }
        } finally {
          setCashuIsBusy(false);
        }
      });
    },
    [
      displayUnit,
      enqueueCashuOp,
      ensureCashuTokenPersisted,
      formatInteger,
      insert,
      isCashuTokenStored,
      isMintDeleted,
      logPaymentEvent,
      mintInfoByUrl,
      refreshMintInfo,
      recentlyReceivedTokenTimerRef,
      resolveOwnerIdForWrite,
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
