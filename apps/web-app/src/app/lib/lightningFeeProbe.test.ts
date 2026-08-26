import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getCachedLightningFee,
  LIGHTNING_FEE_CACHE_TTL_MS,
  probeLightningFee,
} from "./lightningFeeProbe";

describe("probeLightningFee", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("caches a successful probe for a day and drops it afterwards", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (url: string) =>
          new Response(
            JSON.stringify(
              url.endsWith("/v1/mint/quote/bolt11")
                ? { quote: "q1", request: "lnbc1probe" }
                : { quote: "m1", amount: 10000, fee_reserve: 50 },
            ),
          ),
      ),
    );
    const result = await probeLightningFee({
      mintUrl: "https://cashu.cz",
      probeMintUrl: "https://kashu.me",
    });
    const now = Date.now();
    expect(getCachedLightningFee("https://cashu.cz", now)).toEqual(result);
    expect(
      getCachedLightningFee(
        "https://cashu.cz",
        now + LIGHTNING_FEE_CACHE_TTL_MS + 1,
      ),
    ).toBeNull();
    expect(getCachedLightningFee("https://other.example", now)).toBeNull();
  });

  it("aborts both requests when the mint does not answer in time", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () =>
              reject(new Error("aborted")),
            );
          }),
      ),
    );
    await expect(
      probeLightningFee({
        mintUrl: "https://cashu.cz",
        probeMintUrl: "https://kashu.me",
        timeoutMs: 10,
      }),
    ).rejects.toThrow("aborted");
  });

  it("rejects a non-numeric fee_reserve instead of reading it as zero", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (url: string) =>
          new Response(
            JSON.stringify(
              url.endsWith("/v1/mint/quote/bolt11")
                ? { quote: "q1", request: "lnbc1probe" }
                : { quote: "m1", amount: 10000, fee_reserve: null },
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
