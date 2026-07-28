import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { createLinkyBankPaymentOfferEvent } from "../app/lib/bankPaymentOffer";
import type { LocalNostrMessage } from "../app/types/appTypes";
import { BankPaymentOfferBanner } from "./BankPaymentOfferBanner";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  configurable: true,
  value: true,
  writable: true,
});

const createOfferMessage = (
  status: "accepted" | "offered",
  direction: "in" | "out" = "out",
): LocalNostrMessage => {
  const createdAtSec = Math.floor(Date.now() / 1_000);
  const event = createLinkyBankPaymentOfferEvent({
    amountSat: 1_000,
    amountText: "1,000 sat",
    clientId: `client-${status}`,
    createdAt: createdAtSec,
    offerId: "offer-1",
    offererPublicKey: "offerer-pubkey",
    recipientPublicKey: "recipient-pubkey",
    senderPublicKey:
      direction === "out" ? "offerer-pubkey" : "recipient-pubkey",
    spdPayload: null,
    status,
  });

  return {
    contactId: "contact-1",
    content: event.content,
    createdAtSec,
    direction,
    id: `message-${status}`,
    pubkey: direction === "out" ? "offerer-pubkey" : "recipient-pubkey",
    rumorId: null,
    wrapId: `wrap-${status}`,
  };
};

const renderBanner = async (
  message: LocalNostrMessage,
  myPubkeyHex: string,
) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      <BankPaymentOfferBanner
        contacts={[{ id: "contact-1", name: "Alice", npub: "npub1alice" }]}
        formatDisplayedAmountText={(amountSat) => `${amountSat} sat`}
        messages={[message]}
        myPubkeyHex={myPubkeyHex}
        nostrPictureByNpub={{
          npub1alice: "https://example.com/alice.jpg",
        }}
        t={(key) => key}
      />,
    );
  });

  return container;
};

describe("BankPaymentOfferBanner", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("hides the recipient avatar on my unaccepted offer", async () => {
    const container = await renderBanner(
      createOfferMessage("offered"),
      "offerer-pubkey",
    );

    expect(
      container.querySelector(".bank-payment-offer-banner-avatar"),
    ).toBeNull();
  });

  it("shows the recipient avatar after they accept my offer", async () => {
    const container = await renderBanner(
      createOfferMessage("accepted"),
      "offerer-pubkey",
    );

    expect(
      container.querySelector<HTMLImageElement>(
        ".bank-payment-offer-banner-avatar img",
      )?.src,
    ).toBe("https://example.com/alice.jpg");
  });

  it("keeps showing the requester avatar on an incoming offer", async () => {
    const container = await renderBanner(
      createOfferMessage("offered", "in"),
      "recipient-pubkey",
    );

    expect(
      container.querySelector(".bank-payment-offer-banner-avatar"),
    ).not.toBeNull();
  });
});
