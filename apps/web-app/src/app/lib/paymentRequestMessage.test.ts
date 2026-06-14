import { describe, expect, it } from "vitest";
import { encode } from "cbor-x";
import { nip19 } from "nostr-tools";
import {
  buildCashuPaymentRequestMessage,
  buildLinkyPaymentRequestDeclineMessage,
  parseCashuPaymentRequestMessage,
  parseLinkyPaymentRequestDeclineMessage,
} from "./paymentRequestMessage";

const bytesToBase64Url = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
};

describe("paymentRequestMessage", () => {
  it("round-trips a cashu payment request message", () => {
    const recipientNprofile = nip19.nprofileEncode({
      pubkey: "f".repeat(64),
      relays: ["wss://relay.damus.io"],
    });

    const message = buildCashuPaymentRequestMessage({
      amount: 21000,
      description: "Payment request from Linky chat.",
      mintUrls: ["https://mint.example"],
      recipientNprofile,
      requestId: "request-1",
    });

    const parsed = parseCashuPaymentRequestMessage(message);

    expect(parsed).not.toBeNull();
    expect(parsed?.amount).toBe(21000);
    expect(parsed?.description).toBe("Payment request from Linky chat.");
    expect(parsed?.mintUrls).toEqual(["https://mint.example"]);
    expect(parsed?.requestId).toBe("request-1");
    expect(parsed?.transportNprofile).toBe(recipientNprofile);
    expect(parsed?.transportPubkeyHex).toBe("f".repeat(64));
    expect(parsed?.unit).toBe("sat");
  });

  it("parses a cashu payment request with HTTP POST transport", () => {
    const message = `creqA${bytesToBase64Url(
      encode({
        a: 21,
        u: "sat",
        m: ["https://mint.example"],
        t: [
          {
            t: "post",
            a: "https://pay.example/request-1",
          },
        ],
      }),
    )}`;

    const parsed = parseCashuPaymentRequestMessage(message);

    expect(parsed?.amount).toBe(21);
    expect(parsed?.transportNprofile).toBeNull();
    expect(parsed?.transportPostUrl).toBe("https://pay.example/request-1");
    expect(parsed?.transportPubkeyHex).toBeNull();
  });

  it("parses a payment request decline marker", () => {
    const message = buildLinkyPaymentRequestDeclineMessage("rumor-123");

    expect(parseLinkyPaymentRequestDeclineMessage(message)).toEqual({
      requestRumorId: "rumor-123",
    });
  });
});
