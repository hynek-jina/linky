import * as Evolu from "@evolu/common";
import React from "react";
import { parseCashuToken } from "../../../cashu";
import { acceptCashuToken } from "../../../cashuAccept";
import type { ContactId } from "../../../evolu";
import type { JsonValue } from "../../../types/json";
import type { Route } from "../../../types/route";
import { LAST_ACCEPTED_CASHU_TOKEN_STORAGE_KEY } from "../../../utils/constants";
import { safeLocalStorageSet } from "../../../utils/storage";
import { asRecord } from "../../../utils/validation";
import type { CashuTokenRowLike, LocalMintInfoRow } from "../../types/appTypes";

type EvoluMutations = ReturnType<typeof import("../../../evolu").useEvolu>;

interface UseNpubCashClaimParams {
  cashuIsBusy: boolean;
  cashuTokensAll: readonly CashuTokenRowLike[];
  currentNpub: string | null;
  currentNsec: string | null;
  displayUnit: string;
  enqueueCashuOp: (op: () => Promise<void>) => Promise<void>;
  ensureCashuTokenPersisted: (token: string) => void;
  formatInteger: (value: number) => string;
  insert: EvoluMutations["insert"];
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
  npubCashClaimInFlightRef: React.MutableRefObject<boolean>;
  recentlyReceivedTokenTimerRef: React.MutableRefObject<number | null>;
  refreshMintInfo: (mintUrl: string) => Promise<void> | void;
  resolveOwnerIdForWrite: () => Promise<Evolu.OwnerId | null>;
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
  displayUnit,
  enqueueCashuOp,
  ensureCashuTokenPersisted,
  formatInteger,
  insert,
  isMintDeleted,
  logPaymentEvent,
  makeNip98AuthHeader,
  maybeShowPwaNotification,
  mintInfoByUrl,
  npubCashClaimInFlightRef,
  recentlyReceivedTokenTimerRef,
  refreshMintInfo,
  resolveOwnerIdForWrite,
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
          const alreadyStored = cashuTokensAll.some((row) => {
            if (row.isDeleted) return false;
            const stored = String(row.rawToken ?? row.token ?? "").trim();
            return stored && stored === tokenRaw;
          });
          if (alreadyStored) return;

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

          // Remember the last successfully accepted token so we can recover it
          // if storage gets wiped (e.g., private browsing) or if persistence
          // glitches.
          safeLocalStorageSet(
            LAST_ACCEPTED_CASHU_TOKEN_STORAGE_KEY,
            String(accepted.token ?? ""),
          );
          ensureCashuTokenPersisted(String(accepted.token ?? ""));

          // Minimal receive-only banner: click to copy token.
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

          if (routeKind !== "topupInvoice") {
            const title =
              accepted.amount && accepted.amount > 0
                ? t("paidReceived")
                    .replace("{amount}", formatInteger(accepted.amount))
                    .replace("{unit}", displayUnit)
                : t("cashuAccepted");
            showPaidOverlay(title);
          }

          const body =
            accepted.amount && accepted.amount > 0
              ? `${accepted.amount} sat`
              : t("cashuAccepted");
          void maybeShowPwaNotification(t("mints"), body, "cashu_claim");
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
          if (ownerId) {
            insert(
              "cashuToken",
              buildCashuTokenPayload({
                token: tokenRaw,
                rawToken: tokenRaw,
                mint: parsedMint,
                unit: null,
                amount: typeof parsedAmount === "number" ? parsedAmount : null,
                state: "error",
                error: message,
              }),
              { ownerId },
            );
          } else {
            insert(
              "cashuToken",
              buildCashuTokenPayload({
                token: tokenRaw,
                rawToken: tokenRaw,
                mint: parsedMint,
                unit: null,
                amount: typeof parsedAmount === "number" ? parsedAmount : null,
                state: "error",
                error: message,
              }),
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
      displayUnit,
      enqueueCashuOp,
      ensureCashuTokenPersisted,
      formatInteger,
      insert,
      isMintDeleted,
      buildCashuTokenPayload,
      logPaymentEvent,
      maybeShowPwaNotification,
      mintInfoByUrl,
      refreshMintInfo,
      resolveOwnerIdForWrite,
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

    npubCashClaimInFlightRef.current = true;
    const baseUrl = "https://npub.cash";
    try {
      const url = `${baseUrl}/api/v1/claim`;
      const auth = await makeNip98AuthHeader(url, "GET");
      const res = await fetch(url, {
        method: "GET",
        headers: { Authorization: auth },
      });
      if (!res.ok) return;
      const json = (await res.json()) as JsonValue;
      const root = asRecord(json);
      if (!root || root.error) return;

      const tokens: string[] = [];
      const data = asRecord(root.data);
      const token = String(data?.token ?? root.token ?? "").trim();
      if (token) tokens.push(token);
      const dataTokens = data?.tokens;
      if (Array.isArray(dataTokens)) {
        for (const item of dataTokens) {
          const text = String(item ?? "").trim();
          if (text) tokens.push(text);
        }
      }
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
    npubCashClaimInFlightRef,
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
