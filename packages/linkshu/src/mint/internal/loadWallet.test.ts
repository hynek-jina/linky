import type {
  GetInfoResponse,
  GetKeysResponse,
  GetKeysetsResponse,
  KeyChainCache,
} from "@cashu/cashu-ts";
import type { CashuWalletOptions } from "./loadWallet";
import {
  isKeysetVerificationError,
  loadWallet,
  pickPreferredMintKeyset,
} from "./loadWallet";

describe("isKeysetVerificationError", () => {
  it("matches short keyset id mapping failures", () => {
    expect(
      isKeysetVerificationError(
        new Error(
          "A short keyset ID v2 was encountered, but got no keysets to map it to.",
        ),
      ),
    ).toBe(true);
    expect(
      isKeysetVerificationError(
        "Couldn't map short keyset ID 00ff to any known keysets of the current Mint",
      ),
    ).toBe(true);
  });

  it("keeps matching legacy keyset verification failures", () => {
    expect(
      isKeysetVerificationError(
        new Error("Couldn't verify keyset id for mint keys"),
      ),
    ).toBe(true);
    expect(
      isKeysetVerificationError(
        new Error("Couldn't verify keyset ID 01884a74bb2fc5ee"),
      ),
    ).toBe(true);
  });

  it("ignores unrelated cashu failures", () => {
    expect(
      isKeysetVerificationError(
        new Error("Mint keys for keyset are unavailable"),
      ),
    ).toBe(false);
    expect(isKeysetVerificationError(new Error("Mint quote timeout"))).toBe(
      false,
    );
  });
});

describe("pickPreferredMintKeyset", () => {
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

describe("loadWallet", () => {
  it("loads fallback keys for all compatible keysets", async () => {
    const mintInfo: GetInfoResponse = {
      name: "Test mint",
      pubkey: "02" + "ab".repeat(32),
      version: "Nutshell/0.16.0",
      contact: [],
      nuts: {
        "4": { methods: [], disabled: false },
        "5": { methods: [], disabled: false },
      },
    };
    const activeKeys = { "1": "02aa", "2": "02bb" };
    const legacyKeys = { "128": "03cc" };

    const getKeysCalls: Array<string | undefined> = [];
    class FakeMint {
      readonly mintUrl: string;

      constructor(mintUrl: string) {
        this.mintUrl = mintUrl;
      }

      getInfo(): Promise<GetInfoResponse> {
        return Promise.resolve(mintInfo);
      }

      getKeySets(): Promise<GetKeysetsResponse> {
        return Promise.resolve({
          keysets: [
            {
              active: true,
              id: "01884a74bb2fc5ee",
              input_fee_ppk: 10,
              unit: "sat",
            },
            {
              active: false,
              id: "009a1f293253e41e",
              input_fee_ppk: 10,
              unit: "sat",
            },
          ],
        });
      }

      getKeys(keysetId?: string): Promise<GetKeysResponse> {
        getKeysCalls.push(keysetId);
        if (keysetId === "01884a74bb2fc5ee") {
          return Promise.resolve({
            keysets: [
              {
                active: true,
                id: "01884a74bb2fc5ee",
                keys: activeKeys,
                unit: "sat",
              },
            ],
          });
        }
        if (keysetId === "009a1f293253e41e") {
          return Promise.resolve({
            keysets: [
              {
                active: false,
                id: "009a1f293253e41e",
                keys: legacyKeys,
                unit: "sat",
              },
            ],
          });
        }
        return Promise.resolve({ keysets: [] });
      }
    }

    const cacheCalls: Array<{
      mintInfo: GetInfoResponse;
      cache: KeyChainCache;
    }> = [];
    const bindCalls: Array<string> = [];
    class FakeWallet {
      readonly mint: FakeMint;
      readonly options: CashuWalletOptions;

      constructor(mint: FakeMint, options: CashuWalletOptions) {
        this.mint = mint;
        this.options = options;
      }

      loadMint(): Promise<void> {
        return Promise.reject(
          new Error("Couldn't verify keyset ID 01884a74bb2fc5ee"),
        );
      }

      loadMintFromCache(info: GetInfoResponse, cache: KeyChainCache): void {
        cacheCalls.push({ mintInfo: info, cache });
      }

      bindKeyset(id: string): void {
        bindCalls.push(id);
      }
    }

    await loadWallet({
      Mint: FakeMint,
      Wallet: FakeWallet,
      mintUrl: "https://mint.example",
      unit: "sat",
    });

    expect(getKeysCalls).toContain("01884a74bb2fc5ee");
    expect(getKeysCalls).toContain("009a1f293253e41e");
    expect(cacheCalls).toHaveLength(1);
    expect(cacheCalls[0]?.mintInfo).toBe(mintInfo);
    expect(cacheCalls[0]?.cache).toEqual({
      mintUrl: "https://mint.example",
      keysets: [
        {
          active: true,
          id: "01884a74bb2fc5ee",
          input_fee_ppk: 10,
          keys: activeKeys,
          unit: "sat",
        },
        {
          active: false,
          id: "009a1f293253e41e",
          input_fee_ppk: 10,
          keys: legacyKeys,
          unit: "sat",
        },
      ],
    });
    expect(bindCalls).toEqual(["01884a74bb2fc5ee"]);
  });
});
