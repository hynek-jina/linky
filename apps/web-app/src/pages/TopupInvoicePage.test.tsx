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

vi.mock("qrcode", () => ({
  toDataURL: vi.fn(async (payload: string) => `qr:${payload}`),
}));

const translate = (key: string): string => {
  switch (key) {
    case "copy":
      return "Copy";
    case "topupFetchingInvoice":
      return "Loading invoice...";
    case "topupInvoiceTitle":
      return "Top-up invoice";
    case "topupQrModeLabel":
      return "Receive QR type";
    case "topupQrModeCashu":
      return "Cashu";
    case "topupQrModeUniversal":
      return "Universal";
    case "topupQrModeLightning":
      return "Lightning";
    default:
      return key;
  }
};

const waitForQrRender = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, 0);
  });
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
          topupInvoiceCashuRequest="creqAold"
          topupInvoiceError={null}
          topupInvoiceIsBusy={true}
          topupInvoiceQr="data:image/png;base64,old"
          topupInvoiceQrPayload="bitcoin:?lightning=lnbc-old"
          topupMintUrl="https://mint.example"
        />,
      );
    });

    expect(container.textContent).toContain("Loading invoice...");
    expect(container.querySelector(".topup-invoice-qr")).toBeNull();
  });

  it("defaults to the universal QR and switches to Cashu or Lightning only", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const copied: string[] = [];

    await act(async () => {
      root.render(
        <TopupInvoicePage
          copyText={async (text) => {
            copied.push(text);
          }}
          t={translate}
          topupAmount="21"
          topupInvoice="lnbc-invoice"
          topupInvoiceCashuRequest="creqArequest"
          topupInvoiceError={null}
          topupInvoiceIsBusy={false}
          topupInvoiceQr="data:image/png;base64,universal"
          topupInvoiceQrPayload="bitcoin:?lightning=lnbc-invoice&creq=creqArequest"
          topupMintUrl="https://mint.example"
        />,
      );
      await Promise.resolve();
    });

    expect(
      container.querySelector(".topup-invoice-qr")?.getAttribute("src"),
    ).toBe("data:image/png;base64,universal");

    await act(async () => {
      container
        .querySelector(".topup-invoice-copy")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    expect(copied).toEqual([
      "bitcoin:?lightning=lnbc-invoice&creq=creqArequest",
    ]);

    const tabs = Array.from(container.querySelectorAll('[role="tab"]'));
    const cashuTab = tabs.find((tab) => tab.textContent === "Cashu") ?? null;

    await act(async () => {
      cashuTab?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await waitForQrRender();
    });

    expect(
      container.querySelector(".topup-invoice-qr")?.getAttribute("src"),
    ).toBe("qr:creqArequest");

    await act(async () => {
      container
        .querySelector(".topup-invoice-copy")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    expect(copied.at(-1)).toBe("creqArequest");

    const lightningTab =
      tabs.find((tab) => tab.textContent === "Lightning") ?? null;

    await act(async () => {
      lightningTab?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await waitForQrRender();
    });

    expect(
      container.querySelector(".topup-invoice-qr")?.getAttribute("src"),
    ).toBe("qr:lnbc-invoice");

    await act(async () => {
      container
        .querySelector(".topup-invoice-copy")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    expect(copied.at(-1)).toBe("lnbc-invoice");

    await act(async () => {
      root.unmount();
    });
  });
});
