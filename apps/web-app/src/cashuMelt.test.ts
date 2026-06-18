import { afterEach, describe, expect, it, vi } from "vitest";

const {
  createLoadedCashuWalletMock,
  decodeCashuTokenForMintMock,
  getCashuDeterministicSeedFromStorageMock,
  getCashuLibMock,
  walletMock,
} = vi.hoisted(() => ({
  createLoadedCashuWalletMock: vi.fn(),
  decodeCashuTokenForMintMock: vi.fn(),
  getCashuDeterministicSeedFromStorageMock: vi.fn(),
  getCashuLibMock: vi.fn(),
  walletMock: {
    checkProofsStates: vi.fn(),
    createMeltQuoteBolt11: vi.fn(),
    getFeesForProofs: vi.fn(),
    keysetId: "keyset-1",
    meltProofsBolt11: vi.fn(),
    send: vi.fn(),
    unit: "sat",
  },
}));

vi.mock("./utils/cashuDeterministic", () => ({
  bumpCashuDeterministicCounter: vi.fn(),
  getCashuDeterministicCounter: vi.fn(() => 0),
  getCashuDeterministicSeedFromStorage:
    getCashuDeterministicSeedFromStorageMock,
  withCashuDeterministicCounterLock: vi.fn(
    async (_args: unknown, fn: () => Promise<void>) => await fn(),
  ),
}));

vi.mock("./utils/cashuLib", () => ({
  getCashuLib: getCashuLibMock,
}));

vi.mock("./utils/cashuWallet", () => ({
  createLoadedCashuWallet: createLoadedCashuWalletMock,
  decodeCashuTokenForMint: decodeCashuTokenForMintMock,
}));

import { meltInvoiceWithTokensAtMint } from "./cashuMelt";

class FakeAmount {
  private readonly value: number;

  constructor(value: number) {
    this.value = value;
  }

  add(other: FakeAmount): FakeAmount {
    return new FakeAmount(this.value + other.value);
  }

  toNumber(): number {
    return this.value;
  }
}

const makeProof = (secret: string, amount: number) => ({
  C: `C-${secret}`,
  amount,
  id: "keyset-1",
  secret,
});

const readEncodedProofSecrets = (value: unknown): string => {
  if (typeof value !== "object" || value === null) return "";
  if (!("proofs" in value)) return "";
  const proofs = Reflect.get(value, "proofs");
  if (!Array.isArray(proofs)) return "";
  return proofs
    .map((proof) => {
      if (typeof proof !== "object" || proof === null) return "";
      const secret = Reflect.get(proof, "secret");
      return typeof secret === "string" ? secret : "";
    })
    .filter(Boolean)
    .join(",");
};

describe("meltInvoiceWithTokensAtMint", () => {
  afterEach(() => {
    createLoadedCashuWalletMock.mockReset();
    decodeCashuTokenForMintMock.mockReset();
    getCashuDeterministicSeedFromStorageMock.mockReset();
    getCashuLibMock.mockReset();
    walletMock.checkProofsStates.mockReset();
    walletMock.createMeltQuoteBolt11.mockReset();
    walletMock.getFeesForProofs.mockReset();
    walletMock.meltProofsBolt11.mockReset();
    walletMock.send.mockReset();
  });

  it("selects melt proofs first and keeps the unspent remainder", async () => {
    const inputProof = makeProof("input", 1000);
    const proofToMelt = makeProof("send", 550);
    const proofToKeep = makeProof("keep", 400);
    const meltChangeProof = makeProof("change", 49);

    getCashuDeterministicSeedFromStorageMock.mockReturnValue(null);
    getCashuLibMock.mockResolvedValue({
      Mint: vi.fn(),
      Wallet: vi.fn(),
      getEncodedToken: vi.fn(
        (value: unknown) => `encoded:${readEncodedProofSecrets(value)}`,
      ),
      getTokenMetadata: vi.fn(),
    });
    createLoadedCashuWalletMock.mockResolvedValue(walletMock);
    decodeCashuTokenForMintMock.mockReturnValue({ proofs: [inputProof] });
    walletMock.checkProofsStates.mockResolvedValue([{ state: "UNSPENT" }]);
    walletMock.createMeltQuoteBolt11.mockResolvedValue({
      amount: new FakeAmount(500),
      expiry: null,
      fee_reserve: new FakeAmount(50),
      quote: "quote-1",
      request: "lnbc-test",
      state: "UNPAID",
      unit: "sat",
    });
    walletMock.send.mockResolvedValue({
      keep: [proofToKeep],
      send: [proofToMelt],
    });
    walletMock.meltProofsBolt11.mockResolvedValue({
      change: [meltChangeProof],
      fee_paid: 1,
      quote: {
        amount: new FakeAmount(500),
        expiry: null,
        fee_reserve: new FakeAmount(50),
        quote: "quote-1",
        request: "lnbc-test",
        state: "PAID",
        unit: "sat",
      },
    });

    const result = await meltInvoiceWithTokensAtMint({
      invoice: "lnbc-test",
      mint: "https://mint.example",
      tokens: ["cashu-input"],
      unit: "sat",
    });

    expect(walletMock.send).toHaveBeenCalledWith(
      expect.any(FakeAmount),
      [inputProof],
      { includeFees: true },
    );
    expect(walletMock.meltProofsBolt11).toHaveBeenCalledWith(
      expect.any(Object),
      [proofToMelt],
    );
    expect(result).toMatchObject({
      ok: true,
      paidAmount: 500,
      remainingAmount: 449,
      remainingToken: "encoded:keep,change",
    });
  });
});
