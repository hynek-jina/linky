import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createLinkyBankPaymentOfferEvent } from "../app/lib/bankPaymentOffer";
import type { LocalNostrMessage } from "../app/types/appTypes";
import { BankPaymentOfferDetailPage } from "./BankPaymentOfferDetailPage";

vi.mock("../app/context/AppShellContexts", () => ({
  useAppShellCore: () => ({
    formatDisplayedAmountText: (amountSat: number) => `${amountSat} sat`,
    nostrPictureByNpub: {
      npub1alice: "https://example.com/alice.jpg",
    },
  }),
}));

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  configurable: true,
  value: true,
  writable: true,
});

const createOfferMessage = (
  status: "bank_details_sent" | "bank_paid" | "offered" | "settled" = "offered",
): LocalNostrMessage => {
  const createdAtSec = Math.floor(Date.now() / 1_000);
  const event = createLinkyBankPaymentOfferEvent({
    amountSat: 1_000,
    amountText: "1,000 sat",
    clientId: "client-offer-1",
    createdAt: createdAtSec,
    offerId: "offer-1",
    offererPublicKey: "offerer-pubkey",
    recipientPublicKey: "recipient-pubkey",
    senderPublicKey: "offerer-pubkey",
    spdPayload:
      status === "bank_details_sent"
        ? "SPD*1.0*ACC:CZ6508000000192000145399*AM:100.00*CC:CZK"
        : null,
    status,
  });

  return {
    contactId: "contact-1",
    content: event.content,
    createdAtSec,
    direction: "in",
    id: "message-1",
    pubkey: "offerer-pubkey",
    rumorId: null,
    wrapId: "wrap-1",
  };
};

const renderOffer = async (
  onRespondBankPaymentOffer: (
    message: LocalNostrMessage,
    nextStatus:
      | "accepted"
      | "bank_details_sent"
      | "bank_paid"
      | "canceled"
      | "declined"
      | "settled",
  ) => Promise<boolean>,
  status: "bank_details_sent" | "bank_paid" | "offered" = "offered",
) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      <BankPaymentOfferDetailPage
        bankPaymentOfferMessages={[createOfferMessage(status)]}
        chatId="contact-1"
        chatOwnPubkeyHex={
          status === "bank_paid" ? "offerer-pubkey" : "recipient-pubkey"
        }
        contacts={[{ id: "contact-1", name: "Alice", npub: "npub1alice" }]}
        offerId="offer-1"
        onCopyText={() => undefined}
        onRespondBankPaymentOffer={onRespondBankPaymentOffer}
        onSendChatImage={async () => undefined}
        onSettleBankPaymentOffer={async () => undefined}
        t={(key) => key}
      />,
    );
  });

  return container;
};

describe("BankPaymentOfferDetailPage", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    window.location.hash = "";
  });

  it("stays on the payment detail after accepting an offer", async () => {
    window.location.hash = "#chat/contact-1/bank-payment-offer/offer-1";
    const onRespondBankPaymentOffer = vi.fn(async () => true);
    const container = await renderOffer(onRespondBankPaymentOffer);

    await act(async () => {
      container.querySelector<HTMLButtonElement>(".btn-wide")?.click();
    });

    expect(onRespondBankPaymentOffer).toHaveBeenCalledWith(
      expect.objectContaining({ id: "message-1" }),
      "accepted",
    );
    expect(window.location.hash).toBe(
      "#chat/contact-1/bank-payment-offer/offer-1",
    );
  });

  it("returns to the chat after declining an offer", async () => {
    window.location.hash = "#chat/contact-1/bank-payment-offer/offer-1";
    const onRespondBankPaymentOffer = vi.fn(async () => true);
    const container = await renderOffer(onRespondBankPaymentOffer);
    const buttons = container.querySelectorAll<HTMLButtonElement>(".btn-wide");

    await act(async () => {
      buttons[1]?.click();
    });

    expect(onRespondBankPaymentOffer).toHaveBeenCalledWith(
      expect.objectContaining({ id: "message-1" }),
      "declined",
    );
    expect(window.location.hash).toBe("#chat/contact-1");
  });

  it("does not mark the fiat step complete before the recipient confirms payment", async () => {
    const onRespondBankPaymentOffer = vi.fn(async () => true);
    const container = await renderOffer(
      onRespondBankPaymentOffer,
      "bank_details_sent",
    );
    const steps = container.querySelectorAll(
      ".bank-payment-offer-progress-step",
    );

    expect(steps[0]?.classList.contains("is-complete")).toBe(true);
    expect(steps[1]?.classList.contains("is-complete")).toBe(false);
    expect(steps[1]?.querySelector("svg")).toBeNull();
  });

  it("shows settlement confirmation and unpaid actions after the peer marks the bank payment paid", async () => {
    const onRespondBankPaymentOffer = vi.fn(async () => true);
    const container = await renderOffer(onRespondBankPaymentOffer, "bank_paid");
    const buttons = container.querySelectorAll<HTMLButtonElement>(".btn-wide");
    const recipientAvatar = container.querySelector<HTMLImageElement>(
      ".bank-payment-offer-recipient-avatar img",
    );

    expect(recipientAvatar?.src).toBe("https://example.com/alice.jpg");
    expect(buttons[0]?.textContent).toContain("bankPaymentOfferSettle");
    expect(buttons[0]?.querySelector("svg")).not.toBeNull();
    expect(buttons[1]?.textContent).toContain("bankPaymentOfferNotPaid");

    await act(async () => {
      buttons[1]?.click();
    });

    expect(onRespondBankPaymentOffer).toHaveBeenCalledWith(
      expect.objectContaining({ id: "message-1" }),
      "canceled",
    );
  });

  it("shows the recipient waiting state and sends an attached confirmation to the chat", async () => {
    window.location.hash = "#chat/contact-1/bank-payment-offer/offer-1";
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const onSendChatImage = vi.fn(async () => undefined);

    await act(async () => {
      root.render(
        <BankPaymentOfferDetailPage
          bankPaymentOfferMessages={[createOfferMessage("bank_paid")]}
          chatId="contact-1"
          chatOwnPubkeyHex="recipient-pubkey"
          contacts={[{ id: "contact-1", name: "Alice" }]}
          offerId="offer-1"
          onCopyText={() => undefined}
          onRespondBankPaymentOffer={async () => true}
          onSendChatImage={onSendChatImage}
          onSettleBankPaymentOffer={async () => undefined}
          t={(key) => key}
        />,
      );
    });

    expect(container.textContent).toContain(
      "bankPaymentOfferWaitingForSatsTitle",
    );
    expect(container.textContent).toContain(
      "bankPaymentOfferAttachConfirmation",
    );

    const input =
      container.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) throw new Error("confirmation input not found");
    const file = new File(["confirmation"], "confirmation.png", {
      type: "image/png",
    });
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [file],
    });

    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(onSendChatImage).toHaveBeenCalledWith(file);
    expect(window.location.hash).toBe("#chat/contact-1");
  });

  it("closes the payment detail when the recipient receives the sats", async () => {
    window.location.hash = "#chat/contact-1/bank-payment-offer/offer-1";
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <BankPaymentOfferDetailPage
          bankPaymentOfferMessages={[createOfferMessage("settled")]}
          chatId="contact-1"
          chatOwnPubkeyHex="recipient-pubkey"
          contacts={[{ id: "contact-1", name: "Alice" }]}
          offerId="offer-1"
          onCopyText={() => undefined}
          onRespondBankPaymentOffer={async () => true}
          onSendChatImage={async () => undefined}
          onSettleBankPaymentOffer={async () => undefined}
          t={(key) => key}
        />,
      );
    });

    expect(window.location.hash).toBe("#chat/contact-1");
  });
});
