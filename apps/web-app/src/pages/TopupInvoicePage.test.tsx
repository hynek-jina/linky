import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TopupInvoicePage } from "./TopupInvoicePage";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  configurable: true,
  value: true,
  writable: true,
});

vi.mock("../components/WalletBalance", () => ({
  WalletBalance: ({ balance }: { balance: number }) => (
    <div data-testid="wallet-balance">{balance}</div>
  ),
}));

const translate = (key: string): string => {
  switch (key) {
    case "copy":
      return "Copy";
    case "topupFetchingInvoice":
      return "Loading invoice...";
    case "topupInvoiceTitle":
      return "Top-up invoice";
    default:
      return key;
  }
};

describe("TopupInvoicePage", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("shows loading instead of a stale QR while a fresh invoice is loading", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <TopupInvoicePage
          copyText={async () => {}}
          t={translate}
          topupAmount="21"
          topupInvoice="lnbc-old"
          topupInvoiceError={null}
          topupInvoiceIsBusy={true}
          topupInvoiceQr="data:image/png;base64,old"
          topupMintUrl="https://mint.example"
        />,
      );
    });

    expect(container.textContent).toContain("Loading invoice...");
    expect(container.querySelector(".topup-invoice-qr")).toBeNull();
  });
});
