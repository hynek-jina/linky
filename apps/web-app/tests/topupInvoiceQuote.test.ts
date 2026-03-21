import { describe, expect, it } from "vitest";
import {
  topupMintQuoteMatchesRequest,
  type TopupMintQuoteDraft,
} from "../src/app/hooks/topup/useTopupInvoiceQuoteEffects";

const existingQuote: TopupMintQuoteDraft = {
  amount: 2100,
  invoice: "lnbc2100n1p0resumequote",
  mintUrl: "https://mint.example",
  quote: "quote-123",
  unit: "sat",
};

describe("topupMintQuoteMatchesRequest", () => {
  it("reuses an existing pending quote for the same amount and mint", () => {
    expect(
      topupMintQuoteMatchesRequest(existingQuote, {
        amount: 2100,
        mintUrl: "https://mint.example",
      }),
    ).toBe(true);
  });

  it("does not reuse a pending quote when the amount changes", () => {
    expect(
      topupMintQuoteMatchesRequest(existingQuote, {
        amount: 2200,
        mintUrl: "https://mint.example",
      }),
    ).toBe(false);
  });

  it("does not reuse a pending quote when the mint changes", () => {
    expect(
      topupMintQuoteMatchesRequest(existingQuote, {
        amount: 2100,
        mintUrl: "https://other-mint.example",
      }),
    ).toBe(false);
  });
});
