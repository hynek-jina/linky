import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LinkyBankPaymentOfferStatus } from "../app/lib/bankPaymentOffer";
import type { LocalNostrMessage } from "../app/types/appTypes";
import { createLinkyBankPaymentOfferEvent } from "../testUtils/bankPaymentOfferEvent";
import { BankPaymentOfferDetailPage } from "./BankPaymentOfferDetailPage";

vi.mock("../app/context/AppShellContexts", () => ({
  useAppShellCore: () => ({
    formatDisplayedAmountText: (amountSat: number) => `${amountSat} sat`,
    nostrPictureByNpub: {
      npub1alice: "https://example.com/alice.jpg",
    },
  }),
}));

vi.mock("../components/PrivateImageBubble", () => ({
  PrivateImageBubble: () => <div data-testid="payment-confirmation-image" />,
}));

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  configurable: true,
  value: true,
  writable: true,
});

const createOfferMessage = (
  status:
    | "accepted_by_other"
    | "bank_details_sent"
    | "bank_paid"
    | "offered"
    | "settled" = "offered",
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
    rumorId: `rumor-${status}`,
    wrapId: "wrap-1",
  };
};

const renderOffer = async (
  onRespondBankPaymentOffer: (
    message: LocalNostrMessage,
    nextStatus: LinkyBankPaymentOfferStatus,
    options?: {
      expiresAtSec?: number | null;
      extensionSec?: number | null;
      withPush?: boolean;
    },
  ) => Promise<boolean>,
  status:
    | "accepted_by_other"
    | "bank_details_sent"
    | "bank_paid"
    | "offered" = "offered",
) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      <BankPaymentOfferDetailPage
        bankPaymentOfferMessages={[createOfferMessage(status)]}
        chatId="contact-1"
        chatMessages={[]}
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

  it("shows that another candidate accepted first as a closed state", async () => {
    const container = await renderOffer(
      vi.fn(async () => true),
      "accepted_by_other",
    );

    expect(container.textContent).toContain(
      "bankPaymentOfferStatusAcceptedByOther",
    );
    expect(container.textContent).toContain("bankPaymentOfferAcceptedByOther");
    expect(container.querySelectorAll("button")).toHaveLength(1);
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

  it("requests one more minute without changing the active offer phase", async () => {
    const onRespondBankPaymentOffer = vi.fn(async () => true);
    const container = await renderOffer(
      onRespondBankPaymentOffer,
      "bank_details_sent",
    );
    const extendButton = Array.from(
      container.querySelectorAll<HTMLButtonElement>("button"),
    ).find(
      (button) =>
        button.getAttribute("aria-label") === "bankPaymentOfferNeedMoreTime",
    );
    expect(extendButton).not.toBeUndefined();

    await act(async () => {
      extendButton?.click();
    });

    expect(onRespondBankPaymentOffer).toHaveBeenCalledWith(
      expect.objectContaining({ id: "message-1" }),
      "bank_details_sent",
      expect.objectContaining({
        expiresAtSec: expect.any(Number),
        extensionSec: 60,
        withPush: true,
      }),
    );
  });

  it("lets the requester extend the active phase from the compact timer control", async () => {
    const onRespondBankPaymentOffer = vi.fn(async () => true);
    const container = await renderOffer(onRespondBankPaymentOffer, "bank_paid");
    const extendButton = container.querySelector<HTMLButtonElement>(
      ".bank-payment-offer-timer-row .bank-payment-offer-extend",
    );

    expect(extendButton?.textContent).toBe("bankPaymentOfferExtendOneMinute");
    await act(async () => {
      extendButton?.click();
    });

    expect(onRespondBankPaymentOffer).toHaveBeenCalledWith(
      expect.objectContaining({ id: "message-1" }),
      "bank_paid",
      expect.objectContaining({ extensionSec: 60, withPush: true }),
    );
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

  it("keeps the recipient flow open while sending an attached confirmation", async () => {
    window.location.hash = "#chat/contact-1/bank-payment-offer/offer-1";
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const onSendChatImage = vi.fn(async () => undefined);
    const createObjectUrl = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:confirmation-preview");
    const revokeObjectUrl = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => undefined);

    await act(async () => {
      root.render(
        <BankPaymentOfferDetailPage
          bankPaymentOfferMessages={[createOfferMessage("bank_paid")]}
          chatId="contact-1"
          chatMessages={[]}
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

    expect(onSendChatImage).toHaveBeenCalledWith(
      file,
      expect.objectContaining({ rumorId: "rumor-bank_paid" }),
    );
    expect(window.location.hash).toBe(
      "#chat/contact-1/bank-payment-offer/offer-1",
    );
    expect(
      container.querySelector<HTMLImageElement>(
        'img[src="blob:confirmation-preview"]',
      ),
    ).not.toBeNull();
    expect(container.textContent).not.toContain(
      "bankPaymentOfferAttachConfirmation",
    );
    createObjectUrl.mockRestore();
    revokeObjectUrl.mockRestore();
  });

  it.each([
    ["offerer-pubkey", "requester"],
    ["recipient-pubkey", "recipient"],
  ])("shows an attached confirmation to the %s flow", async (ownPubkey) => {
    const offerMessage = createOfferMessage("bank_paid");
    const confirmationMessage: LocalNostrMessage = {
      contactId: "contact-1",
      content: JSON.stringify({
        encryptedSha256: "encrypted",
        encryptedSize: 10,
        encryptionAlgorithm: "aes-gcm",
        fileType: "image/jpeg",
        height: 100,
        key: "key",
        nonce: "nonce",
        originalSha256: "original",
        storageEncoding: "raw",
        type: "linky.private_image.v1",
        url: "https://example.com/confirmation.jpg",
        width: 100,
      }),
      createdAtSec: offerMessage.createdAtSec + 1,
      direction: ownPubkey === "recipient-pubkey" ? "out" : "in",
      id: "confirmation-message",
      pubkey: "recipient-pubkey",
      replyToId: "rumor-bank_paid",
      rootMessageId: "rumor-bank_paid",
      rumorId: "confirmation-rumor",
      wrapId: "confirmation-wrap",
    };
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <BankPaymentOfferDetailPage
          bankPaymentOfferMessages={[offerMessage]}
          chatId="contact-1"
          chatMessages={[offerMessage, confirmationMessage]}
          chatOwnPubkeyHex={ownPubkey}
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

    expect(container.textContent).toContain("bankPaymentOfferConfirmation");
    expect(
      container.querySelector('[data-testid="payment-confirmation-image"]'),
    ).not.toBeNull();
    expect(container.textContent).not.toContain(
      "bankPaymentOfferAttachConfirmation",
    );
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
          chatMessages={[]}
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
