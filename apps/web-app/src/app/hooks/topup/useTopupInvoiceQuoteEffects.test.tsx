import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import {
  type TopupMintQuoteDraft,
  useTopupInvoiceQuoteEffects,
} from "./useTopupInvoiceQuoteEffects";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  configurable: true,
  value: true,
  writable: true,
});

interface HookHarnessProps {
  initialTopupInvoice: string | null;
  initialTopupInvoiceQr: string | null;
  routeKind?: "topup" | "topupInvoice" | "wallet";
  topupMintQuote: TopupMintQuoteDraft;
}

const HookHarness = ({
  initialTopupInvoice,
  initialTopupInvoiceQr,
  routeKind = "topupInvoice",
  topupMintQuote,
}: HookHarnessProps): React.ReactElement => {
  const [topupAmount, setTopupAmount] = React.useState(
    String(topupMintQuote.amount),
  );
  const [topupInvoice, setTopupInvoice] = React.useState<string | null>(
    initialTopupInvoice,
  );
  const [topupInvoiceError, setTopupInvoiceError] = React.useState<
    string | null
  >(null);
  const [topupInvoiceIsBusy, setTopupInvoiceIsBusy] = React.useState(false);
  const [topupInvoiceCashuRequest, setTopupInvoiceCashuRequest] =
    React.useState<string | null>(null);
  const [topupInvoiceQr, setTopupInvoiceQr] = React.useState<string | null>(
    initialTopupInvoiceQr,
  );
  const [topupInvoiceQrPayload, setTopupInvoiceQrPayload] = React.useState<
    string | null
  >(initialTopupInvoiceQr ? initialTopupInvoice : null);
  const [currentTopupMintQuote, setTopupMintQuote] =
    React.useState<TopupMintQuoteDraft | null>(topupMintQuote);
  const topupInvoicePaidHandledRef = React.useRef(false);
  const topupInvoiceStartBalanceRef = React.useRef<number | null>(null);
  const topupPaidNavTimerRef = React.useRef<number | null>(null);

  useTopupInvoiceQuoteEffects({
    defaultMintUrl: topupMintQuote.mintUrl,
    effectiveMyLightningAddress: "me@linky.fit",
    routeKind,
    t: (key: string) => key,
    topupAmount,
    topupInvoice,
    topupInvoiceError,
    topupInvoiceIsBusy,
    topupInvoiceCashuRequest,
    topupInvoicePaidHandledRef,
    topupInvoiceQr,
    topupInvoiceQrPayload,
    topupInvoiceStartBalanceRef,
    topupMintQuote: currentTopupMintQuote,
    topupPaidNavTimerRef,
    topupRefreshKey: null,
    topupRecipientNprofile: null,
    setTopupAmount,
    setTopupInvoice,
    setTopupInvoiceCashuRequest,
    setTopupInvoiceError,
    setTopupInvoiceIsBusy,
    setTopupInvoiceQr,
    setTopupInvoiceQrPayload,
    setTopupMintQuote,
  });

  return (
    <div>
      <div data-testid="invoice">{topupInvoice ?? ""}</div>
      <div data-testid="amount">{topupAmount}</div>
      <div data-testid="quote">{currentTopupMintQuote?.quote ?? ""}</div>
      <div data-testid="cashu-request">{topupInvoiceCashuRequest ?? ""}</div>
      <div data-testid="qr">{topupInvoiceQr ?? ""}</div>
      <div data-testid="qr-payload">{topupInvoiceQrPayload ?? ""}</div>
    </div>
  );
};

describe("useTopupInvoiceQuoteEffects", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("clears a stale QR when a different invoice arrives", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <HookHarness
          initialTopupInvoice="lnbc-old"
          initialTopupInvoiceQr="qr:lnbc-old"
          topupMintQuote={{
            amount: 2100,
            invoice: "lnbc-new",
            mintUrl: "https://mint.example",
            quote: "quote-new",
            unit: "sat",
          }}
        />,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(
      container.querySelector('[data-testid="invoice"]')?.textContent,
    ).toBe("lnbc-new");
    expect(container.querySelector('[data-testid="qr"]')?.textContent).toBe("");

    await act(async () => {
      root.unmount();
    });
  });

  it("keeps a pending quote when leaving the invoice route", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <HookHarness
          initialTopupInvoice="lnbc-pending"
          initialTopupInvoiceQr="qr:lnbc-pending"
          routeKind="wallet"
          topupMintQuote={{
            amount: 2100,
            invoice: "lnbc-pending",
            mintUrl: "https://mint.example",
            quote: "quote-pending",
            unit: "sat",
          }}
        />,
      );
      await Promise.resolve();
    });

    expect(
      container.querySelector('[data-testid="invoice"]')?.textContent,
    ).toBe("");
    expect(container.querySelector('[data-testid="qr"]')?.textContent).toBe("");
    expect(container.querySelector('[data-testid="amount"]')?.textContent).toBe(
      "2100",
    );
    expect(container.querySelector('[data-testid="quote"]')?.textContent).toBe(
      "quote-pending",
    );

    await act(async () => {
      root.unmount();
    });
  });
});
