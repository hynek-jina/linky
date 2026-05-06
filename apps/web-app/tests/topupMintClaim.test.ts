import { describe, expect, it } from "vitest";
import {
  isTopupMintQuoteClaimableState,
  shouldKeepTopupQuoteAfterClaimError,
} from "../src/app/hooks/topup/topupMintClaim";
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
      isCashuOutputsAlreadySignedError(new Error("outputs already signed")),
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

  it("drops the pending quote after an already-signed restore miss", () => {
    // Recovery in mintTopupProofs exhausts the deterministic restore loop
    // before we land here, so retrying the same quote forever just spams
    // the mint with the same failing call.
    expect(
      shouldKeepTopupQuoteAfterClaimError(
        new Error("outputs already signed"),
        isCashuOutputsAlreadySignedError,
      ),
    ).toBe(false);
  });
});
