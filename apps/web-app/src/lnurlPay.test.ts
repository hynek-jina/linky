import { bech32 } from "@scure/base";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchLnurlInvoiceForTarget,
  fetchLnurlPayPreview,
  fetchLnurlWithdrawPreview,
  inferLightningAddressFromLnurlTarget,
  LnurlTagMismatchError,
  redeemLnurlWithdraw,
} from "./lnurlPay";

const encodeLnurl = (url: string): string => {
  const bytes = new TextEncoder().encode(url);
  return bech32.encode("lnurl", bech32.toWords(bytes), 2000).toUpperCase();
};

describe("LNURL-pay lightning address metadata", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not treat an LNbits pay-link ID as a lightning address", async () => {
    const target = encodeLnurl("https://lnbits.cz/lnurlp//KfCp5v");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          callback: "https://lnbits.cz/lnurlp/api/v1/lnurl/cb/KfCp5v",
          maxSendable: 3000,
          metadata: '[["text/plain", "testík"]]',
          minSendable: 3000,
          tag: "payRequest",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    expect(inferLightningAddressFromLnurlTarget(target)).toBeNull();
    await expect(fetchLnurlPayPreview(target)).resolves.toMatchObject({
      lightningAddress: null,
    });
  });

  it("uses a text/identifier lightning address from LNURL metadata", async () => {
    const target = encodeLnurl("https://lnbits.cz/lnurlp//jn32N6");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          callback: "https://lnbits.cz/lnurlp/api/v1/lnurl/cb/jn32N6",
          maxSendable: 5000,
          metadata:
            '[["text/plain", "Payment to testik"], ["text/identifier", "testik@lnbits.cz"]]',
          minSendable: 5000,
          tag: "payRequest",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    await expect(fetchLnurlPayPreview(target)).resolves.toMatchObject({
      lightningAddress: "testik@lnbits.cz",
    });
  });

  it("returns the metadata address with the invoice used for payment", async () => {
    const target = encodeLnurl("https://lnbits.cz/lnurlp//jn32N6");
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          callback: "https://lnbits.cz/lnurlp/api/v1/lnurl/cb/jn32N6",
          maxSendable: 5000,
          metadata:
            '[["text/plain", "Payment to testik"], ["text/identifier", "testik@lnbits.cz"]]',
          minSendable: 5000,
          tag: "payRequest",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ pr: "lnbc1testinvoice" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(fetchLnurlInvoiceForTarget(target, 5)).resolves.toMatchObject({
      lightningAddress: "testik@lnbits.cz",
    });
  });
});

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
