import { bech32 } from "@scure/base";
import { describe, expect, it } from "vitest";
import {
  getLnurlPayDisplayText,
  inferLightningAddressFromLnurlTarget,
  isLightningAddress,
  resolveLnurlPayRequestUrl,
} from "../src/lnurlPay";

const encodeLnurl = (url: string): string => {
  const bytes = new TextEncoder().encode(url);
  return bech32.encode("lnurl", bech32.toWords(bytes), 2048);
};

describe("lnurlPay", () => {
  it("recognizes lightning addresses", () => {
    expect(isLightningAddress("alice@example.com")).toBe(true);
    expect(
      isLightningAddress("https://example.com/.well-known/lnurlp/alice"),
    ).toBe(false);
  });

  it("resolves LNURL bech32 targets to request URLs", () => {
    const requestUrl = "https://pay.example.com/lnurl/callback";
    const lnurl = encodeLnurl(requestUrl);

    expect(resolveLnurlPayRequestUrl(lnurl)).toBe(requestUrl);
  });

  it("builds a readable display label for LNURL targets", () => {
    const requestUrl = "https://pay.example.com/lnurl/callback";

    expect(getLnurlPayDisplayText(requestUrl)).toBe(
      "pay.example.com/lnurl/callback",
    );
  });

  it("infers a lightning address from well-known LNURL pay urls", () => {
    expect(
      inferLightningAddressFromLnurlTarget(
        "https://walletofsatoshi.com/.well-known/lnurlp/poorjames425",
      ),
    ).toBe("poorjames425@walletofsatoshi.com");
  });

  it("supports lnurlp scheme with a lightning address target", () => {
    expect(
      resolveLnurlPayRequestUrl("lnurlp://poorjames425@walletofsatoshi.com"),
    ).toBe("https://walletofsatoshi.com/.well-known/lnurlp/poorjames425");
  });
});
