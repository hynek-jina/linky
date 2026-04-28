import { bech32 } from "@scure/base";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchLnurlWithdrawPreview,
  LnurlTagMismatchError,
  redeemLnurlWithdraw,
} from "./lnurlPay";

const encodeLnurl = (url: string): string => {
  const bytes = new TextEncoder().encode(url);
  return bech32.encode("lnurl", bech32.toWords(bytes), 2000).toUpperCase();
};

describe("fetchLnurlWithdrawPreview", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the max withdrawable amount in sats", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          callback: "https://withdraw.example/cb",
          defaultDescription: "Voucher",
          k1: "nonce-1",
          maxWithdrawable: 21000,
          minWithdrawable: 21000,
          tag: "withdrawRequest",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    await expect(
      fetchLnurlWithdrawPreview("lnurlw://withdraw.example/lnurl"),
    ).resolves.toMatchObject({
      amountSat: 21,
      callback: "https://withdraw.example/cb",
      description: "Voucher",
      k1: "nonce-1",
      maxAmountSat: 21,
      minAmountSat: 21,
      target: "withdraw.example/lnurl",
    });
  });

  it("accepts a lightning-prefixed bech32 LNURL-withdraw QR", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          callback: "https://withdraw.example/cb",
          defaultDescription: "Voucher",
          k1: "nonce-1",
          maxWithdrawable: 21000,
          minWithdrawable: 21000,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    const lnurl = encodeLnurl("https://withdraw.example/lnurl");

    await expect(
      fetchLnurlWithdrawPreview(`lightning:${lnurl}`),
    ).resolves.toMatchObject({
      amountSat: 21,
      target: "withdraw.example/lnurl",
    });
  });

  it("throws a tag mismatch error for LNURL-pay metadata", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          callback: "https://pay.example/cb",
          maxSendable: 1000,
          minSendable: 1000,
          tag: "payRequest",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    await expect(
      fetchLnurlWithdrawPreview("lnurlw://pay.example/lnurl"),
    ).rejects.toBeInstanceOf(LnurlTagMismatchError);
  });
});

describe("redeemLnurlWithdraw", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls the withdraw callback with k1 and invoice", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ status: "OK" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(
      redeemLnurlWithdraw({
        callback: "https://withdraw.example/cb?foo=bar",
        invoice: "lnbc1testinvoice",
        k1: "nonce-2",
      }),
    ).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://withdraw.example/cb?foo=bar&k1=nonce-2&pr=lnbc1testinvoice",
    );
  });
});
