import { describe, expect, it } from "vitest";
import {
  isCashuKeysetVerificationError,
  pickPreferredMintKeyset,
} from "../src/utils/cashuWallet";

describe("cashuWallet helpers", () => {
  it("detects keyset verification failures", () => {
    expect(
      isCashuKeysetVerificationError(
        new Error("Couldn't verify keyset ID 01884a74bb2fc5ee"),
      ),
    ).toBe(true);
    expect(
      isCashuKeysetVerificationError(new Error("Mint quote timeout")),
    ).toBe(false);
  });

  it("prefers the lowest-fee active hex keyset for the requested unit", () => {
    const keyset = pickPreferredMintKeyset(
      [
        {
          active: true,
          id: "base64-keyset",
          input_fee_ppk: 1,
          unit: "sat",
        },
        {
          active: true,
          id: "01bbbb",
          input_fee_ppk: 200,
          unit: "sat",
        },
        {
          active: true,
          id: "01aaaa",
          input_fee_ppk: 100,
          unit: "sat",
        },
        {
          active: true,
          id: "01cccc",
          input_fee_ppk: 50,
          unit: "msat",
        },
        {
          active: false,
          id: "01dddd",
          input_fee_ppk: 0,
          unit: "sat",
        },
      ],
      "sat",
    );

    expect(keyset?.id).toBe("01aaaa");
  });

  it("returns null when no compatible keyset exists", () => {
    expect(
      pickPreferredMintKeyset(
        [
          {
            active: false,
            id: "01aaaa",
            input_fee_ppk: 100,
            unit: "sat",
          },
        ],
        "sat",
      ),
    ).toBeNull();
  });
});
