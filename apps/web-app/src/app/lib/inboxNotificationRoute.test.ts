import { describe, expect, it } from "vitest";
import {
  isOpenBankPaymentOffer,
  isOpenChatForContact,
} from "./inboxNotificationRoute";

describe("inbox notification route matching", () => {
  it("matches only the currently open contact chat", () => {
    expect(
      isOpenChatForContact({ kind: "chat", id: "contact-1" }, "contact-1"),
    ).toBe(true);
    expect(
      isOpenChatForContact({ kind: "chat", id: "contact-2" }, "contact-1"),
    ).toBe(false);
    expect(
      isOpenChatForContact(
        {
          kind: "bankPaymentOffer",
          offerId: "offer-1",
        },
        "contact-1",
      ),
    ).toBe(false);
  });

  it("matches only the currently open proxy payment", () => {
    expect(
      isOpenBankPaymentOffer(
        { kind: "bankPaymentOffer", offerId: "offer-1" },
        "offer-1",
      ),
    ).toBe(true);
    expect(
      isOpenBankPaymentOffer(
        { kind: "bankPaymentOffer", offerId: "offer-2" },
        "offer-1",
      ),
    ).toBe(false);
    expect(
      isOpenBankPaymentOffer({ kind: "chat", id: "contact-1" }, "offer-1"),
    ).toBe(false);
  });
});
