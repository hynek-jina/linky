import React from "react";
import type { Route } from "../../../types/route";
import { MAIN_MINT_URL, normalizeMintUrl } from "../../../utils/mint";

interface TopupMintQuoteDraft {
  amount: number;
  mintUrl: string;
  quote: string;
  unit: string | null;
}

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
  topupPaidNavTimerRef: React.MutableRefObject<number | null>;
  topupRefreshKey: string | null;
  setTopupAmount: React.Dispatch<React.SetStateAction<string>>;
  setTopupDebug: React.Dispatch<React.SetStateAction<string | null>>;
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
  topupPaidNavTimerRef,
  topupRefreshKey,
  setTopupAmount,
  setTopupDebug,
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
    // Reset topup state when leaving the topup flow.
    if (routeKind !== "topup" && routeKind !== "topupInvoice") {
      setTopupAmount("");
      setTopupInvoice(null);
      setTopupInvoiceQr(null);
      setTopupInvoiceError(null);
      setTopupInvoiceIsBusy(false);
      setTopupMintQuote(null);
      setTopupDebug(null);

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
    setTopupDebug,
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

    let cancelled = false;
    isFetchingRef.current = true;
    setTopupInvoice(null);
    setTopupInvoiceQr(null);
    setTopupInvoiceError(null);
    setTopupInvoiceIsBusy(true);
    setTopupDebug(`quote: ${mintUrl}`);

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
          const shouldProxy =
            typeof import.meta !== "undefined" &&
            Boolean(import.meta.env?.DEV) &&
            typeof window !== "undefined";
          const targetUrl = shouldProxy
            ? `/__mint-quote?mint=${encodeURIComponent(baseUrl)}`
            : `${baseUrl}/v1/mint/quote/bolt11`;

          setTopupDebug(
            `quote: ${baseUrl} (${shouldProxy ? "proxy" : "direct"} fetch)`,
          );

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

          setTopupDebug(`quote: ${baseUrl} (response ${quoteRes.status})`);

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
          mintUrl,
          quote: quoteId,
          amount: amountSat,
          unit: "sat",
        });
        setTopupDebug(`quote: ${mintUrl} (invoice ready)`);

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
          setTopupDebug(`quote: ${mintUrl} (error)`);
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
    setTopupDebug,
    setTopupInvoice,
    setTopupInvoiceError,
    setTopupInvoiceIsBusy,
    setTopupInvoiceQr,
    setTopupMintQuote,
    t,
    topupAmount,
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
