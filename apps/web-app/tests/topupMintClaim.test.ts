import { describe, expect, it } from "vitest";
import { isTopupMintQuoteClaimableState } from "../src/app/hooks/topup/topupMintClaim";
import { isCashuOutputsAlreadySignedError } from "../src/utils/cashuErrors";

describe("topup mint claim helpers", () => {
  it("treats PAID and ISSUED quote states as claimable", () => {
    const mintQuoteStates = {
      ISSUED: "ISSUED",
      PAID: "PAID",
    };

    expect(isTopupMintQuoteClaimableState("PAID", mintQuoteStates)).toBe(true);
    expect(isTopupMintQuoteClaimableState("issued", mintQuoteStates)).toBe(
      true,
    );
    expect(isTopupMintQuoteClaimableState("UNPAID", mintQuoteStates)).toBe(
      false,
    );
  });

  it("recognizes retryable already-signed mint errors", () => {
    expect(
      isCashuOutputsAlreadySignedError(
        new Error("outputs have already been signed"),
      ),
    ).toBe(true);
    expect(
      isCashuOutputsAlreadySignedError(
        new Error("keyset id already signed before"),
      ),
    ).toBe(true);
    expect(isCashuOutputsAlreadySignedError(new Error("network failed"))).toBe(
      false,
    );
  });
});
