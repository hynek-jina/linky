import type { MintKeyset } from "@cashu/cashu-ts";
import { describe, expect, it, vi } from "vitest";
import {
  decodeCashuTokenForMint,
  isCashuKeysetVerificationError,
} from "./cashuWallet";

describe("isCashuKeysetVerificationError", () => {
  it("matches short keyset id mapping failures", () => {
    expect(
      isCashuKeysetVerificationError(
        new Error(
          "A short keyset ID v2 was encountered, but got no keysets to map it to.",
        ),
      ),
    ).toBe(true);
    expect(
      isCashuKeysetVerificationError(
        "Couldn't map short keyset ID 00ff to any known keysets of the current Mint",
      ),
    ).toBe(true);
  });

  it("keeps matching legacy keyset verification failures", () => {
    expect(
      isCashuKeysetVerificationError(
        new Error("Couldn't verify keyset id for mint keys"),
      ),
    ).toBe(true);
  });

  it("ignores unrelated cashu failures", () => {
    expect(
      isCashuKeysetVerificationError(
        new Error("Mint keys for keyset are unavailable"),
      ),
    ).toBe(false);
  });
});

describe("decodeCashuTokenForMint", () => {
  it("passes mint keysets into token decoding", () => {
    const keysets: MintKeyset[] = [];
    const decodedToken = { mint: "https://mint.example", proofs: [] };
    const getDecodedToken = vi.fn(() => decodedToken);

    expect(
      decodeCashuTokenForMint({
        tokenText: "cashuA...",
        mintUrl: "https://mint.example",
        keysets,
        getTokenMetadata: () => ({ mint: "https://mint.example" }),
        getDecodedToken,
      }),
    ).toBe(decodedToken);

    expect(getDecodedToken).toHaveBeenCalledWith("cashuA...", keysets);
  });

  it("supports short keyset tokens once mint keysets are available", () => {
    const keysets = [{} as MintKeyset];
    const decodedToken = { mint: "https://mint.example", proofs: [] };
    const getDecodedToken = vi.fn(
      (tokenText: string, mappedKeysets?: MintKeyset[]) => {
        if (!mappedKeysets) {
          throw new Error(
            "A short keyset ID v2 was encountered, but got no keysets to map it to.",
          );
        }
        expect(tokenText).toBe("cashuA...");
        expect(mappedKeysets).toBe(keysets);
        return decodedToken;
      },
    );

    expect(
      decodeCashuTokenForMint({
        tokenText: "cashuA...",
        mintUrl: "https://mint.example",
        keysets,
        getTokenMetadata: () => ({ mint: "https://mint.example" }),
        getDecodedToken,
      }),
    ).toBe(decodedToken);
  });

  it("rejects tokens from a different mint before decoding", () => {
    const getDecodedToken = vi.fn(() => ({ mint: "https://other.example" }));

    expect(() =>
      decodeCashuTokenForMint({
        tokenText: "cashuA...",
        mintUrl: "https://mint.example",
        keysets: [],
        getTokenMetadata: () => ({ mint: "https://other.example" }),
        getDecodedToken,
      }),
    ).toThrow("Mixed mints not supported");

    expect(getDecodedToken).not.toHaveBeenCalled();
  });
});
