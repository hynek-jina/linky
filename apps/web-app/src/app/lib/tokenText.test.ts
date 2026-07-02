import { describe, expect, it } from "vitest";
import { extractCashuTokenFromText, extractCashuTokenMeta } from "./tokenText";

const buildCashuToken = (): string => {
  const payload = JSON.stringify({
    token: [
      {
        mint: "https://mint.example",
        proofs: [
          { amount: 8, secret: "secret-a", C: "c-a", id: "keyset" },
          { amount: 13, secret: "secret-b", C: "c-b", id: "keyset" },
        ],
      },
    ],
  });
  const base64Url = btoa(payload)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  return `cashuA${base64Url}`;
};

describe("extractCashuTokenMeta", () => {
  it("derives mint, unit, and amount from the token", () => {
    const token = buildCashuToken();

    expect(extractCashuTokenMeta({ token })).toEqual({
      tokenText: token,
      mint: "https://mint.example",
      unit: "sat",
      amount: 21,
    });
  });

  it("prefers token metadata over deprecated stored snapshots", () => {
    const token = buildCashuToken();

    expect(
      extractCashuTokenMeta({
        token,
        mint: "https://stale.example",
        unit: "usd",
        amount: 999,
      }),
    ).toEqual({
      tokenText: token,
      mint: "https://mint.example",
      unit: "sat",
      amount: 21,
    });
  });
});

describe("extractCashuTokenFromText", () => {
  it("does not treat bank payment offers as Cashu tokens", () => {
    const bankOffer = JSON.stringify({
      amountSat: 76,
      amountText: "76 sat",
      offerId: "offer-1",
      offererPublicKey: "pubkey",
      status: "offered",
      statusUpdatedAtSec: 1,
      text: "Nabízím platbu za 76 sat",
      type: "linky.bank_payment_offer",
      version: 1,
    });

    expect(extractCashuTokenFromText(bankOffer)).toBeNull();
  });

  it("does not treat SPD bank payment payloads as Cashu tokens", () => {
    expect(
      extractCashuTokenFromText(
        "SPD*1.0*ACC:CZ5855000000001265098001*AM:480.50*CC:CZK*MSG:Faktura",
      ),
    ).toBeNull();
  });
});
