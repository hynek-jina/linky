import { afterEach, describe, expect, it, vi } from "vitest";
import { probeLightningFee } from "./lightningFeeProbe";

describe("probeLightningFee", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("quotes an invoice from the probe mint and derives the fee percent", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(url);
        if (url.endsWith("/v1/mint/quote/bolt11")) {
          return new Response(
            JSON.stringify({ quote: "q1", request: "lnbc1probe" }),
          );
        }
        return new Response(
          JSON.stringify({
            quote: "m1",
            amount: 10000,
            fee_reserve: 100,
            state: "UNPAID",
          }),
        );
      }),
    );

    const result = await probeLightningFee({
      mintUrl: "https://cashu.cz",
      probeMintUrl: "https://kashu.me",
    });

    expect(calls).toEqual([
      "https://kashu.me/v1/mint/quote/bolt11",
      "https://cashu.cz/v1/melt/quote/bolt11",
    ]);
    expect(result).toEqual({
      amountSat: 10000,
      feeReserveSat: 100,
      percent: 1,
    });
  });

  it("throws when the melt quote has no fee_reserve", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (url: string) =>
          new Response(
            JSON.stringify(
              url.endsWith("/v1/mint/quote/bolt11")
                ? { quote: "q1", request: "lnbc1probe" }
                : { quote: "m1" },
            ),
          ),
      ),
    );
    await expect(
      probeLightningFee({
        mintUrl: "https://cashu.cz",
        probeMintUrl: "https://kashu.me",
      }),
    ).rejects.toThrow("fee_reserve");
  });
});
