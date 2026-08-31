import { describe, expect, it } from "vitest";
import {
  isClaimableMintQuoteState,
  readMintQuoteState,
} from "../src/app/lib/autoswapClaim";

describe("autoswap mint quote state", () => {
  it("reads quote state from state or status fields", () => {
    expect(readMintQuoteState({ state: "PAID" })).toBe("PAID");
    expect(readMintQuoteState({ status: "ISSUED" })).toBe("ISSUED");
    expect(readMintQuoteState({})).toBe("");
  });

  it("treats paid and issued quotes as claimable", () => {
    const MintQuoteState = {
      PAID: "PAID",
      ISSUED: "ISSUED",
    };

    expect(isClaimableMintQuoteState("paid", MintQuoteState)).toBe(true);
    expect(isClaimableMintQuoteState("PAID", MintQuoteState)).toBe(true);
    expect(isClaimableMintQuoteState("issued", MintQuoteState)).toBe(true);
    expect(isClaimableMintQuoteState("ISSUED", MintQuoteState)).toBe(true);
    expect(isClaimableMintQuoteState("unpaid", MintQuoteState)).toBe(false);
  });
});
