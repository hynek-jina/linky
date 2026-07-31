import { describe, expect, it, vi } from "vitest";
import { createCashuTokenRowFixture } from "../../../testUtils/cashuTokenRow";
import { buildCashuMintCandidates } from "../../lib/paymentMintSelection";
import type { CashuTokenWithMeta } from "../../lib/tokenText";
import { selectCashuMessagePayment } from "./selectCashuMessagePayment";

const tokenWithMeta = (input: {
  amount: number;
  mint: string;
  rawToken?: string;
  state: string;
  token?: string;
}): CashuTokenWithMeta => {
  const row = createCashuTokenRowFixture({
    id: input.token || input.rawToken || "empty-token-row",
    ...(input.rawToken ? { rawToken: input.rawToken } : {}),
    state: input.state,
    ...(input.token ? { token: input.token } : {}),
  });

  return {
    ...row,
    amount: input.amount,
    mint: input.mint,
    token: input.token ? row.token : null,
    tokenText: input.token ?? input.rawToken ?? "",
    unit: "sat",
  };
};

describe("selectCashuMessagePayment", () => {
  it("groups only accepted rows with usable mint and token text", () => {
    const buildCandidates = vi.fn(buildCashuMintCandidates);
    const result = selectCashuMessagePayment({
      amountSat: 70,
      buildCandidates,
      cashuBalance: 100,
      defaultMintUrl: "https://preferred.example///",
      normalizeMintUrl: (mint) => mint.replace(/\/+$/, ""),
      tokens: [
        tokenWithMeta({
          amount: 40,
          mint: "https://mint.example",
          state: "accepted",
          token: "token-a",
        }),
        tokenWithMeta({
          amount: 35,
          mint: "https://mint.example",
          rawToken: "legacy-token",
          state: "accepted",
        }),
        tokenWithMeta({
          amount: 500,
          mint: "https://mint.example",
          state: "reserved",
          token: "reserved",
        }),
        tokenWithMeta({
          amount: 500,
          mint: "",
          state: "accepted",
          token: "missing-mint",
        }),
        tokenWithMeta({
          amount: 500,
          mint: "https://mint.example",
          state: "accepted",
        }),
      ],
    });

    expect(buildCandidates).toHaveBeenCalledWith(
      new Map([
        [
          "https://mint.example",
          { sum: 75, tokens: ["token-a", "legacy-token"] },
        ],
      ]),
      "https://preferred.example",
    );
    expect(result).toMatchObject({
      amountAttempts: [70],
      candidate: {
        mint: "https://mint.example",
        sum: 75,
        tokens: ["token-a", "legacy-token"],
      },
      kind: "selected",
      requestedAmountSat: 70,
    });
  });

  it("uses the smaller of wallet balance and requested amount", () => {
    const result = selectCashuMessagePayment({
      amountSat: 200,
      buildCandidates: buildCashuMintCandidates,
      cashuBalance: 100,
      defaultMintUrl: null,
      normalizeMintUrl: (mint) => mint,
      tokens: [
        tokenWithMeta({
          amount: 100,
          mint: "https://mint.example",
          state: "accepted",
          token: "token",
        }),
      ],
    });

    expect(result).toMatchObject({
      amountAttempts: [100, 99, 98, 97, 95, 92, 87, 79],
      kind: "selected",
      requestedAmountSat: 100,
    });
  });

  it("never combines balances from different mints", () => {
    const result = selectCashuMessagePayment({
      amountSat: 100,
      buildCandidates: buildCashuMintCandidates,
      cashuBalance: 120,
      defaultMintUrl: null,
      normalizeMintUrl: (mint) => mint,
      tokens: [
        tokenWithMeta({
          amount: 60,
          mint: "https://mint-a.example",
          state: "accepted",
          token: "token-a",
        }),
        tokenWithMeta({
          amount: 60,
          mint: "https://mint-b.example",
          state: "accepted",
          token: "token-b",
        }),
      ],
    });

    expect(result).toMatchObject({
      kind: "insufficient",
      requestedAmountSat: 100,
    });
  });

  it("returns insufficient when there are no covering candidates", () => {
    const result = selectCashuMessagePayment({
      amountSat: 100,
      buildCandidates: buildCashuMintCandidates,
      cashuBalance: 100,
      defaultMintUrl: null,
      normalizeMintUrl: (mint) => mint,
      tokens: [
        tokenWithMeta({
          amount: 100,
          mint: "https://mint.example",
          state: "pending",
          token: "pending",
        }),
        tokenWithMeta({
          amount: 100,
          mint: "https://mint.example",
          state: "issued",
          token: "issued",
        }),
        tokenWithMeta({
          amount: 100,
          mint: "https://mint.example",
          state: "externalized",
          token: "externalized",
        }),
      ],
    });

    expect(result).toEqual({
      candidates: [],
      kind: "insufficient",
      requestedAmountSat: 100,
    });
  });
});
