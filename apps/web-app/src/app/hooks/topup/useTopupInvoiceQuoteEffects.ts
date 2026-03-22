import React from "react";
import { isNativePlatform } from "../../../platform/runtime";
import type { Route } from "../../../types/route";
import { MAIN_MINT_URL, normalizeMintUrl } from "../../../utils/mint";

export interface TopupMintQuoteDraft {
  amount: number;
  invoice: string | null;
  mintUrl: string;
  quote: string;
  unit: string | null;
}

export const topupMintQuoteMatchesRequest = (
  quote: TopupMintQuoteDraft | null,
  args: {
    amount: number;
    mintUrl: string;
  },
): boolean => {
  if (!quote) return false;

  return quote.amount === args.amount && quote.mintUrl === args.mintUrl;
};

interface UseTopupInvoiceQuoteEffectsParams {
  currentNpub: string | null;
  defaultMintUrl: string | null;
  routeKind: Route["kind"];
  t: (key: string) => string;
  topupAmount: string;
  topupInvoice: string | null;
  topupInvoiceError: string | null;
  topupInvoiceIsBusy: boolean;
  topupInvoicePaidHandledRef: React.MutableRefObject<boolean>;
  topupInvoiceQr: string | null;
  topupInvoiceStartBalanceRef: React.MutableRefObject<number | null>;
  topupMintQuote: TopupMintQuoteDraft | null;
  topupPaidNavTimerRef: React.MutableRefObject<number | null>;
  topupRefreshKey: string | null;
  setTopupAmount: React.Dispatch<React.SetStateAction<string>>;
  setTopupInvoice: React.Dispatch<React.SetStateAction<string | null>>;
  setTopupInvoiceError: React.Dispatch<React.SetStateAction<string | null>>;
  setTopupInvoiceIsBusy: React.Dispatch<React.SetStateAction<boolean>>;
  setTopupInvoiceQr: React.Dispatch<React.SetStateAction<string | null>>;
  setTopupMintQuote: React.Dispatch<
    React.SetStateAction<TopupMintQuoteDraft | null>
  >;
}

export const useTopupInvoiceQuoteEffects = ({
  currentNpub,
  defaultMintUrl,
  routeKind,
  t,
  topupAmount,
  topupInvoice,
  topupInvoiceError,
  topupInvoiceIsBusy,
  topupInvoicePaidHandledRef,
  topupInvoiceQr,
  topupInvoiceStartBalanceRef,
  topupMintQuote,
  topupPaidNavTimerRef,
  topupRefreshKey,
  setTopupAmount,
  setTopupInvoice,
  setTopupInvoiceError,
  setTopupInvoiceIsBusy,
  setTopupInvoiceQr,
  setTopupMintQuote,
}: UseTopupInvoiceQuoteEffectsParams) => {
  // Ref-based guard to prevent the fetch effect from cancelling itself.
  // Using state (topupInvoiceIsBusy) as a dependency would cause the effect
  // to re-trigger and abort the in-flight request when React re-renders.
  const isFetchingRef = React.useRef(false);

  React.useEffect(() => {
    if (routeKind !== "topupInvoice") return;
    if (!topupMintQuote?.invoice) return;
    if (topupInvoice === topupMintQuote.invoice && topupInvoiceQr) return;

    let cancelled = false;

    void (async () => {
      setTopupInvoice(topupMintQuote.invoice);
      setTopupInvoiceError(null);

      if (topupInvoiceQr) return;

      const QRCode = await import("qrcode");
      const qr = await QRCode.toDataURL(topupMintQuote.invoice, {
        margin: 1,
        width: 320,
      });
      if (cancelled) return;
      setTopupInvoiceQr(qr);
    })();

    return () => {
      cancelled = true;
    };
  }, [
    routeKind,
    setTopupInvoice,
    setTopupInvoiceError,
    setTopupInvoiceQr,
    topupInvoice,
    topupInvoiceQr,
    topupMintQuote,
  ]);

  React.useEffect(() => {
    // Reset topup state when leaving the topup flow.
    if (routeKind !== "topup" && routeKind !== "topupInvoice") {
      setTopupAmount("");
      setTopupInvoice(null);
      setTopupInvoiceQr(null);
      setTopupInvoiceError(null);
      setTopupInvoiceIsBusy(false);

      isFetchingRef.current = false;
      topupInvoiceStartBalanceRef.current = null;
      topupInvoicePaidHandledRef.current = false;
      if (topupPaidNavTimerRef.current !== null) {
        try {
          window.clearTimeout(topupPaidNavTimerRef.current);
        } catch {
          // ignore
        }
        topupPaidNavTimerRef.current = null;
      }
    }
  }, [
    routeKind,
    setTopupAmount,
    setTopupInvoice,
    setTopupInvoiceError,
    setTopupInvoiceIsBusy,
    setTopupInvoiceQr,
    setTopupMintQuote,
    topupInvoicePaidHandledRef,
    topupInvoiceStartBalanceRef,
    topupPaidNavTimerRef,
  ]);

  React.useEffect(() => {
    if (routeKind !== "topupInvoice") return;
    if (isFetchingRef.current) return;

    const lnAddress = currentNpub ? `${currentNpub}@npub.cash` : "";
    const amountSat = Number.parseInt(topupAmount.trim(), 10);
    const invalid = !lnAddress || !Number.isFinite(amountSat) || amountSat <= 0;
    if (invalid) {
      setTopupInvoice(null);
      setTopupInvoiceQr(null);
      setTopupInvoiceError(null);
      setTopupInvoiceIsBusy(false);
      return;
    }

    const mintUrl = normalizeMintUrl(defaultMintUrl ?? MAIN_MINT_URL);
    if (!mintUrl) {
      setTopupInvoice(null);
      setTopupInvoiceQr(null);
      setTopupInvoiceError(t("topupInvoiceFailed"));
      setTopupInvoiceIsBusy(false);
      return;
    }

    if (
      topupMintQuoteMatchesRequest(topupMintQuote, {
        amount: amountSat,
        mintUrl,
      })
    ) {
      setTopupInvoiceError(null);
      setTopupInvoiceIsBusy(false);
      return;
    }

    let cancelled = false;
    isFetchingRef.current = true;
    setTopupInvoice(null);
    setTopupInvoiceQr(null);
    setTopupInvoiceError(null);
    setTopupInvoiceIsBusy(true);

    topupInvoiceStartBalanceRef.current = null;
    topupInvoicePaidHandledRef.current = false;

    let quoteController: AbortController | null = null;
    void (async () => {
      try {
        const fetchWithTimeout = async (
          url: string,
          options: RequestInit,
          ms: number,
        ) => {
          quoteController = new AbortController();
          let timeoutId: number | null = null;
          const timeout = new Promise<never>((_, reject) => {
            timeoutId = window.setTimeout(() => {
              try {
                quoteController?.abort();
              } catch {
                // ignore
              }
              reject(new Error("Mint quote timeout"));
            }, ms);
          });
          try {
            return await Promise.race([
              fetch(url, { ...options, signal: quoteController.signal }),
              timeout,
            ]);
          } finally {
            if (timeoutId !== null) window.clearTimeout(timeoutId);
          }
        };

        const requestQuote = async (baseUrl: string) => {
          const targetUrl = isNativePlatform()
            ? `${baseUrl.replace(/\/+$/, "")}/v1/mint/quote/bolt11`
            : `/api/mint-quote?mint=${encodeURIComponent(baseUrl)}`;

          const quoteRes = await fetchWithTimeout(
            targetUrl,
            {
              method: "POST",
              headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ amount: amountSat, unit: "sat" }),
            },
            12_000,
          );

          if (!quoteRes.ok) {
            throw new Error(`Mint quote HTTP ${quoteRes.status}`);
          }

          const rawText = await quoteRes.text();
          let mintQuote: Record<string, unknown> | null = null;
          try {
            const parsed = rawText ? JSON.parse(rawText) : null;
            mintQuote =
              parsed && typeof parsed === "object"
                ? (parsed as Record<string, unknown>)
                : null;
          } catch {
            throw new Error(
              `Mint quote parse failed (${quoteRes.status}): ${rawText.slice(
                0,
                200,
              )}`,
            );
          }
          const quoteId = String(
            mintQuote?.quote ?? mintQuote?.id ?? "",
          ).trim();
          const invoice = String(
            mintQuote?.request ??
              mintQuote?.pr ??
              mintQuote?.paymentRequest ??
              "",
          ).trim();

          return { quoteId, invoice };
        };

        const { quoteId, invoice } = await requestQuote(mintUrl);

        if (!quoteId || !invoice) {
          throw new Error(
            `Missing mint quote (quote=${quoteId || "-"}, invoice=${
              invoice || "-"
            })`,
          );
        }

        if (cancelled) return;

        setTopupMintQuote({
          invoice,
          mintUrl,
          quote: quoteId,
          amount: amountSat,
          unit: "sat",
        });

        setTopupInvoice(invoice);

        const QRCode = await import("qrcode");
        const qr = await QRCode.toDataURL(invoice, {
          margin: 1,
          width: 320,
        });
        if (cancelled) return;
        setTopupInvoiceQr(qr);
      } catch (error) {
        if (!cancelled) {
          const message = String(error ?? "");
          const lower = message.toLowerCase();
          const corsHint =
            lower.includes("failed to fetch") ||
            lower.includes("cors") ||
            lower.includes("networkerror")
              ? "CORS blocked"
              : "";
          console.log("[linky][topup] mint quote failed", {
            mintUrl,
            amountSat,
            error: message,
          });
          setTopupInvoiceError(
            message
              ? `${t("topupInvoiceFailed")}: ${corsHint || message}`
              : t("topupInvoiceFailed"),
          );
        }
      } finally {
        isFetchingRef.current = false;
        if (!cancelled) setTopupInvoiceIsBusy(false);
      }
    })();

    return () => {
      cancelled = true;
      isFetchingRef.current = false;
      if (quoteController) {
        try {
          quoteController.abort();
        } catch {
          // ignore
        }
      }
    };

    // (topupInvoice, topupInvoiceQr, topupInvoiceError, topupInvoiceIsBusy)
    // are intentionally excluded: including them causes the effect to
    // re-trigger and cancel its own in-flight fetch. The isFetchingRef guard
    // prevents concurrent requests instead.
  }, [
    currentNpub,
    defaultMintUrl,
    routeKind,
    setTopupInvoice,
    setTopupInvoiceError,
    setTopupInvoiceIsBusy,
    setTopupInvoiceQr,
    setTopupMintQuote,
    t,
    topupAmount,
    topupMintQuote,
    topupInvoicePaidHandledRef,
    topupInvoiceStartBalanceRef,
    topupRefreshKey,
  ]);

  React.useEffect(() => {
    if (routeKind !== "topupInvoice") return;
    if (!topupInvoiceIsBusy) return;
    if (topupInvoice || topupInvoiceQr || topupInvoiceError) return;

    const timeoutId = window.setTimeout(() => {
      setTopupInvoiceError(`${t("topupInvoiceFailed")}: timeout`);
      setTopupInvoiceIsBusy(false);
    }, 15_000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    routeKind,
    setTopupInvoiceError,
    setTopupInvoiceIsBusy,
    t,
    topupInvoice,
    topupInvoiceError,
    topupInvoiceIsBusy,
    topupInvoiceQr,
  ]);
};
