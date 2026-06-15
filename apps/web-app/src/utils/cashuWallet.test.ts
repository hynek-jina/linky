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
  it("uses the loaded wallet to decode tokens", () => {
    const decodedToken = { mint: "https://mint.example", proofs: [] };
    const wallet = { decodeToken: vi.fn(() => decodedToken) };

    expect(
      decodeCashuTokenForMint({
        tokenText: "cashuA...",
        mintUrl: "https://mint.example",
        getTokenMetadata: () => ({ mint: "https://mint.example" }),
        wallet,
      }),
    ).toBe(decodedToken);

    expect(wallet.decodeToken).toHaveBeenCalledWith("cashuA...");
  });

  it("lets wallet decoding handle short keyset tokens", () => {
    const decodedToken = { mint: "https://mint.example", proofs: [] };
    const wallet = {
      decodeToken: vi.fn((tokenText: string) => {
        expect(tokenText).toBe("cashuA...");
        return decodedToken;
      }),
    };

    expect(
      decodeCashuTokenForMint({
        tokenText: "cashuA...",
        mintUrl: "https://mint.example",
        getTokenMetadata: () => ({ mint: "https://mint.example" }),
        wallet,
      }),
    ).toBe(decodedToken);
  });

  it("rejects tokens from a different mint before decoding", () => {
    const wallet = {
      decodeToken: vi.fn(() => ({ mint: "https://other.example", proofs: [] })),
    };

    expect(() =>
      decodeCashuTokenForMint({
        tokenText: "cashuA...",
        mintUrl: "https://mint.example",
        getTokenMetadata: () => ({ mint: "https://other.example" }),
        wallet,
      }),
    ).toThrow("Mixed mints not supported");

    expect(wallet.decodeToken).not.toHaveBeenCalled();
  });
});
