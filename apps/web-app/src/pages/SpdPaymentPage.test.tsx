import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SpdPaymentPage } from "./SpdPaymentPage";

vi.mock("../app/context/AppShellContexts", () => ({
  useAppShellCore: () => ({
    displayCurrency: "sat",
    displayUnit: "sat",
    formatDisplayedAmountText: (amountSat: number) => `${amountSat} sat`,
    lang: "en",
  }),
}));

vi.mock("../app/hooks/useFiatRates", () => ({
  useFiatRates: () => ({
    chfPerBtc: 1_000_000,
    czkPerBtc: 1_000_000,
    eurPerBtc: 1_000_000,
    usdPerBtc: 1_000_000,
  }),
}));

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  configurable: true,
  value: true,
  writable: true,
});

const t = (key: string): string => {
  if (key === "spdPaymentRequestReimbursementCountOther") {
    return "Ask {count} contacts to pay";
  }
  return key;
};

describe("SpdPaymentPage offer recipients", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("selects the first configured contacts and sends manual changes", async () => {
    const onRequestReimbursement = vi.fn(async () => false);
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <SpdPaymentPage
          cashuBalanceAfterMelt={100_000}
          initialOfferContactCount={2}
          offerContacts={[
            { id: "a", name: "Alice", npub: "npub1alice" },
            { id: "b", name: "Bob", npub: "npub1bob" },
            { id: "c", name: "Carol", npub: "npub1carol" },
          ]}
          onRequestReimbursement={onRequestReimbursement}
          spdPayload="SPD*1.0*ACC:CZ5855000000001265098001*AM:480*CC:CZK"
          t={t}
        />,
      );
    });

    const contactButtons = Array.from(
      container.querySelectorAll<HTMLButtonElement>(
        ".bank-payment-offer-contact",
      ),
    );
    expect(
      contactButtons.map((button) => button.getAttribute("aria-pressed")),
    ).toEqual(["true", "true", "false"]);
    const requestButton = container.querySelector<HTMLButtonElement>(
      ".bank-payment-request",
    );
    const contactList = container.querySelector(
      ".bank-payment-offer-contact-list",
    );
    expect(
      requestButton &&
        contactList &&
        Boolean(requestButton.compareDocumentPosition(contactList) & 4),
    ).toBe(true);
    expect(container.querySelector(".bank-payment-open-actions")).toBeNull();
    expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(
      0,
    );

    await act(async () => {
      contactButtons[1]?.click();
      contactButtons[2]?.click();
    });

    await act(async () => {
      requestButton?.click();
    });

    expect(onRequestReimbursement).toHaveBeenCalledOnce();
    expect(onRequestReimbursement).toHaveBeenCalledWith(
      expect.objectContaining({
        contacts: [
          expect.objectContaining({ id: "a" }),
          expect.objectContaining({ id: "c" }),
        ],
      }),
    );
  });
});
