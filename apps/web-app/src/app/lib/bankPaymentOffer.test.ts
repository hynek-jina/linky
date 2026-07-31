import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createLinkyBankPaymentOfferEvent,
  forgetLinkyBankPaymentOfferSpdPayload,
  getLinkyBankPaymentOfferInfo,
  isLinkyBankPaymentOfferExpired,
  markLinkyBankPaymentOfferBankDetailsSent,
  readLinkyBankPaymentOfferSpdRecord,
  rememberLinkyBankPaymentOfferSpdPayload,
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

describe("bank payment offer SPD payload storage", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("persists the payload and reads it back for the owner", () => {
    rememberLinkyBankPaymentOfferSpdPayload({
      offerId: "offer-1",
      ownerPubkey: "owner-a",
      spdPayload: "SPD*1.0*ACC:CZ123",
    });

    const record = readLinkyBankPaymentOfferSpdRecord({
      offerId: "offer-1",
      ownerPubkey: "owner-a",
    });
    expect(record?.spdPayload).toBe("SPD*1.0*ACC:CZ123");
    expect(record?.sentCandidateKeys).toEqual([]);
  });

  it("does not return payloads stored by a different owner", () => {
    rememberLinkyBankPaymentOfferSpdPayload({
      offerId: "offer-1",
      ownerPubkey: "owner-a",
      spdPayload: "SPD*1.0*ACC:CZ123",
    });

    expect(
      readLinkyBankPaymentOfferSpdRecord({
        offerId: "offer-1",
        ownerPubkey: "owner-b",
      }),
    ).toBeNull();
  });

  it("expires stored payloads after the max age", () => {
    rememberLinkyBankPaymentOfferSpdPayload({
      offerId: "offer-1",
      ownerPubkey: "owner-a",
      spdPayload: "SPD*1.0*ACC:CZ123",
    });

    vi.setSystemTime(1_700_000_000_000 + 60 * 60 * 1000);
    expect(
      readLinkyBankPaymentOfferSpdRecord({
        offerId: "offer-1",
        ownerPubkey: "owner-a",
      }),
    ).toBeNull();
    expect(
      localStorage.getItem("linky.bank_payment_offer_spd.v1.offer-1"),
    ).toBeNull();
  });

  it("tracks sent candidate keys without duplicates", () => {
    rememberLinkyBankPaymentOfferSpdPayload({
      offerId: "offer-1",
      ownerPubkey: "owner-a",
      spdPayload: "SPD*1.0*ACC:CZ123",
    });

    markLinkyBankPaymentOfferBankDetailsSent({
      candidateKey: "offer-1:contact-1",
      offerId: "offer-1",
    });
    markLinkyBankPaymentOfferBankDetailsSent({
      candidateKey: "offer-1:contact-1",
      offerId: "offer-1",
    });
    expect(
      readLinkyBankPaymentOfferSpdRecord({
        offerId: "offer-1",
        ownerPubkey: "owner-a",
      })?.sentCandidateKeys,
    ).toEqual(["offer-1:contact-1"]);
  });

  it("keeps records of concurrent offers independent", () => {
    rememberLinkyBankPaymentOfferSpdPayload({
      offerId: "offer-1",
      ownerPubkey: "owner-a",
      spdPayload: "SPD*1.0*ACC:CZ111",
    });
    rememberLinkyBankPaymentOfferSpdPayload({
      offerId: "offer-2",
      ownerPubkey: "owner-a",
      spdPayload: "SPD*1.0*ACC:CZ222",
    });
    forgetLinkyBankPaymentOfferSpdPayload("offer-1");

    expect(
      readLinkyBankPaymentOfferSpdRecord({
        offerId: "offer-2",
        ownerPubkey: "owner-a",
      })?.spdPayload,
    ).toBe("SPD*1.0*ACC:CZ222");
  });

  it("prunes expired records from storage when remembering a new one", () => {
    rememberLinkyBankPaymentOfferSpdPayload({
      offerId: "offer-old",
      ownerPubkey: "owner-a",
      spdPayload: "SPD*1.0*ACC:CZ111",
    });

    vi.setSystemTime(1_700_000_000_000 + 60 * 60 * 1000);
    rememberLinkyBankPaymentOfferSpdPayload({
      offerId: "offer-new",
      ownerPubkey: "owner-a",
      spdPayload: "SPD*1.0*ACC:CZ222",
    });

    expect(
      localStorage.getItem("linky.bank_payment_offer_spd.v1.offer-old"),
    ).toBeNull();
  });

  it("forgets a stored payload", () => {
    rememberLinkyBankPaymentOfferSpdPayload({
      offerId: "offer-1",
      ownerPubkey: "owner-a",
      spdPayload: "SPD*1.0*ACC:CZ123",
    });

    forgetLinkyBankPaymentOfferSpdPayload("offer-1");
    expect(
      readLinkyBankPaymentOfferSpdRecord({
        offerId: "offer-1",
        ownerPubkey: "owner-a",
      }),
    ).toBeNull();
  });

  it("survives corrupted storage content", () => {
    localStorage.setItem(
      "linky.bank_payment_offer_spd.v1.offer-1",
      "{not json",
    );
    expect(
      readLinkyBankPaymentOfferSpdRecord({
        offerId: "offer-1",
        ownerPubkey: "owner-a",
      }),
    ).toBeNull();

    rememberLinkyBankPaymentOfferSpdPayload({
      offerId: "offer-1",
      ownerPubkey: "owner-a",
      spdPayload: "SPD*1.0*ACC:CZ123",
    });
    expect(
      readLinkyBankPaymentOfferSpdRecord({
        offerId: "offer-1",
        ownerPubkey: "owner-a",
      })?.spdPayload,
    ).toBe("SPD*1.0*ACC:CZ123");
  });
});
