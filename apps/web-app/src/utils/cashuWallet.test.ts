import { describe, expect, it, vi } from "vitest";
import {
  createLoadedCashuWallet,
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

describe("createLoadedCashuWallet", () => {
  it("loads fallback keys for all compatible keysets", async () => {
    const mintInfo = { name: "Test mint" };
    const activeKeys = { "1": "02aa", "2": "02bb" };
    const legacyKeys = { "128": "03cc" };
    const mintGetKeys = vi.fn(async (id?: string) => {
      if (id === "01active") {
        return {
          keysets: [
            {
              active: true,
              id: "01active",
              keys: activeKeys,
              unit: "sat",
            },
          ],
        };
      }
      if (id === "01legacy") {
        return {
          keysets: [
            {
              active: false,
              id: "01legacy",
              keys: legacyKeys,
              unit: "sat",
            },
          ],
        };
      }
      return { keysets: [] };
    });

    class FakeMint {
      readonly mintUrl: string;

      constructor(mintUrl: string) {
        this.mintUrl = mintUrl;
      }

      getInfo = vi.fn(async () => mintInfo);

      getKeySets = vi.fn(async () => ({
        keysets: [
          {
            active: true,
            id: "01active",
            input_fee_ppk: 10,
            unit: "sat",
          },
          {
            active: false,
            id: "01legacy",
            input_fee_ppk: 10,
            unit: "sat",
          },
        ],
      }));

      getKeys = mintGetKeys;
    }

    const loadMintFromCache = vi.fn();
    const bindKeyset = vi.fn();

    class FakeWallet {
      readonly mint: FakeMint;
      readonly options: { bip39seed?: Uint8Array; unit?: string };

      constructor(
        mint: FakeMint,
        options: { bip39seed?: Uint8Array; unit?: string },
      ) {
        this.mint = mint;
        this.options = options;
      }

      loadMint = vi.fn(async () => {
        throw new Error("Couldn't verify keyset ID 01884a74bb2fc5ee");
      });

      loadMintFromCache = loadMintFromCache;

      bindKeyset = bindKeyset;
    }

    await createLoadedCashuWallet({
      Mint: FakeMint as unknown as typeof import("@cashu/cashu-ts").Mint,
      Wallet: FakeWallet as unknown as typeof import("@cashu/cashu-ts").Wallet,
      mintUrl: "https://mint.example",
      unit: "sat",
    });

    expect(mintGetKeys).toHaveBeenCalledWith("01active");
    expect(mintGetKeys).toHaveBeenCalledWith("01legacy");
    expect(loadMintFromCache).toHaveBeenCalledWith(mintInfo, {
      mintUrl: "https://mint.example",
      keysets: [
        {
          active: true,
          id: "01active",
          input_fee_ppk: 10,
          keys: activeKeys,
          unit: "sat",
        },
        {
          active: false,
          id: "01legacy",
          input_fee_ppk: 10,
          keys: legacyKeys,
          unit: "sat",
        },
      ],
    });
    expect(bindKeyset).toHaveBeenCalledWith("01active");
  });
});
