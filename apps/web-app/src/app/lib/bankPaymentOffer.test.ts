import { describe, expect, it } from "vitest";
import {
  createLinkyBankPaymentOfferEvent,
  getLinkyBankPaymentOfferInfo,
  isLinkyBankPaymentOfferExpired,
  shouldPushLinkyBankPaymentOfferStatus,
  type LinkyBankPaymentOfferStatus,
} from "./bankPaymentOffer";

const createOffer = (status: LinkyBankPaymentOfferStatus) =>
  createLinkyBankPaymentOfferEvent({
    amountText: "250 Kč",
    clientId: "client-1",
    createdAt: 1_700_000_000,
    recipientPublicKey: "recipient",
    senderPublicKey: "sender",
    status,
  });

describe("bank payment offer notifications", () => {
  const copyCases: readonly (readonly [LinkyBankPaymentOfferStatus, string])[] =
    [
      ["offered", "Zaplatíš za mě bankovní platbu ve výši 250 Kč?"],
      ["accepted", "Nabídka byla přijata. Platební údaje se odesílají."],
      [
        "bank_details_sent",
        "Platební údaje jsou připravené. Zaplať 250 Kč do 5 minut.",
      ],
      [
        "bank_paid",
        "Bankovní platba za 250 Kč byla označena jako zaplacená. Zkontroluj ji a odešli saty.",
      ],
      ["canceled", "Nabídka byla zrušena. Bankovní platbu už neposílej."],
    ];

  it.each(copyCases)("uses actionable copy for %s", (status, expectedText) => {
    expect(
      getLinkyBankPaymentOfferInfo(createOffer(status).content)?.text,
    ).toBe(expectedText);
  });

  it("pushes offer states that require the other party's attention", () => {
    expect(shouldPushLinkyBankPaymentOfferStatus("offered")).toBe(true);
    expect(shouldPushLinkyBankPaymentOfferStatus("accepted")).toBe(true);
    expect(shouldPushLinkyBankPaymentOfferStatus("bank_details_sent")).toBe(
      true,
    );
    expect(shouldPushLinkyBankPaymentOfferStatus("bank_paid")).toBe(true);
    expect(shouldPushLinkyBankPaymentOfferStatus("declined")).toBe(true);
    expect(shouldPushLinkyBankPaymentOfferStatus("canceled")).toBe(false);
    expect(shouldPushLinkyBankPaymentOfferStatus("settled")).toBe(false);
  });

  it("recognizes an offer whose active phase has expired", () => {
    const info = getLinkyBankPaymentOfferInfo(createOffer("offered").content);
    expect(info).not.toBeNull();
    if (!info) return;

    expect(
      isLinkyBankPaymentOfferExpired(info, 1_700_000_000, 1_700_000_299),
    ).toBe(false);
    expect(
      isLinkyBankPaymentOfferExpired(info, 1_700_000_000, 1_700_000_300),
    ).toBe(true);
  });

  it("does not label terminal offer states as expired", () => {
    const info = getLinkyBankPaymentOfferInfo(createOffer("canceled").content);
    expect(info).not.toBeNull();
    if (!info) return;

    expect(
      isLinkyBankPaymentOfferExpired(info, 1_700_000_000, 1_800_000_000),
    ).toBe(false);
  });
});
