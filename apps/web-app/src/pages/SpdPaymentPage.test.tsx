import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SpdPaymentPage } from "./SpdPaymentPage";

const { navigateTo } = vi.hoisted(() => ({ navigateTo: vi.fn() }));

vi.mock("../hooks/useRouting", () => ({ navigateTo }));

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
  if (key === "spdPaymentLastResponseTime") {
    return "Last time {time}";
  }
  return key;
};

describe("SpdPaymentPage offer recipients", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("selects the first configured contacts and sends manual changes", async () => {
    const onRequestReimbursement = vi.fn(async () => null);
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

  it("opens the newly created proxy payment", async () => {
    const onRequestReimbursement = vi.fn(async () => ({
      chatId: "contact-a",
      offerId: "offer-1",
    }));
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <SpdPaymentPage
          cashuBalanceAfterMelt={100_000}
          initialOfferContactCount={1}
          offerContacts={[
            { id: "contact-a", name: "Alice", npub: "npub1alice" },
          ]}
          onRequestReimbursement={onRequestReimbursement}
          spdPayload="SPD*1.0*ACC:CZ5855000000001265098001*AM:480*CC:CZK"
          t={t}
        />,
      );
    });

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(".bank-payment-request")
        ?.click();
    });

    expect(navigateTo).toHaveBeenCalledWith({
      route: "bankPaymentOffer",
      chatId: "contact-a",
      offerId: "offer-1",
    });
  });

  it("shows each candidate's last payment response in minutes and seconds", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <SpdPaymentPage
          cashuBalanceAfterMelt={100_000}
          initialOfferContactCount={1}
          offerContacts={[
            {
              id: "contact-a",
              lastBankPaymentResponseSec: 125,
              name: "Alice",
              npub: "npub1alice",
            },
            { id: "contact-b", name: "Bob", npub: "npub1bob" },
          ]}
          onRequestReimbursement={async () => null}
          spdPayload="SPD*1.0*ACC:CZ5855000000001265098001*AM:480*CC:CZK"
          t={t}
        />,
      );
    });

    const candidates = container.querySelectorAll(
      ".bank-payment-offer-contact",
    );
    expect(candidates[0]?.textContent).toContain("Last time 02:05");
    expect(candidates[1]?.textContent).not.toContain("Last time");
  });
});
