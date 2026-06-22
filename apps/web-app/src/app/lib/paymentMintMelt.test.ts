import { describe, expect, it } from "vitest";
import {
  canOfferPaymentMintMelt,
  getPaymentMintMeltPlan,
} from "./paymentMintMelt";

describe("payment mint melt offer", () => {
  it("combines the main balance with every token from the largest foreign mint", () => {
    const plan = getPaymentMintMeltPlan({
      mainMint: "https://main.example",
      balances: [
        { mint: "https://main.example", sum: 40 },
        { mint: "https://small.example", sum: 20 },
        { mint: "https://large.example", sum: 80 },
      ],
    });

    expect(plan).toEqual({
      fromMint: "https://large.example",
      maxBalanceAfterMelt: 120,
      sourceBalance: 80,
      targetBalance: 40,
      toMint: "https://main.example",
    });
  });

  it("offers a melt only when no current mint covers the payment but the plan can", () => {
    const plan = getPaymentMintMeltPlan({
      mainMint: "https://main.example",
      balances: [
        { mint: "https://main.example", sum: 40 },
        { mint: "https://foreign.example", sum: 80 },
      ],
    });

    expect(
      canOfferPaymentMintMelt({ amountSat: 100, currentBalance: 80, plan }),
    ).toBe(true);
    expect(
      canOfferPaymentMintMelt({ amountSat: 70, currentBalance: 80, plan }),
    ).toBe(false);
    expect(
      canOfferPaymentMintMelt({ amountSat: 121, currentBalance: 80, plan }),
    ).toBe(false);
  });
});
