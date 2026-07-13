import { describe, expect, it } from "vitest";
import {
  createLinkyBankPaymentOfferEvent,
  getLinkyBankPaymentOfferInfo,
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

  it("only pushes actionable non-terminal offer states by default", () => {
    expect(shouldPushLinkyBankPaymentOfferStatus("offered")).toBe(true);
    expect(shouldPushLinkyBankPaymentOfferStatus("accepted")).toBe(true);
    expect(shouldPushLinkyBankPaymentOfferStatus("bank_details_sent")).toBe(
      true,
    );
    expect(shouldPushLinkyBankPaymentOfferStatus("bank_paid")).toBe(true);
    expect(shouldPushLinkyBankPaymentOfferStatus("declined")).toBe(false);
    expect(shouldPushLinkyBankPaymentOfferStatus("canceled")).toBe(false);
    expect(shouldPushLinkyBankPaymentOfferStatus("settled")).toBe(false);
  });
});
