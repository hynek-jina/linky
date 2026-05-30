import { describe, expect, it } from "vitest";
import { resolveNpubCashServerBaseUrl } from "./npubCashServer";

describe("resolveNpubCashServerBaseUrl", () => {
  it("keeps npub.cash addresses on the default server", () => {
    expect(resolveNpubCashServerBaseUrl("alice@npub.cash")).toBe(
      "https://npub.cash",
    );
  });

  it("maps linky.fit addresses to the hosted npub.linky.fit server", () => {
    expect(resolveNpubCashServerBaseUrl("alice@linky.fit")).toBe(
      "https://npub.linky.fit",
    );
  });

  it("normalizes lightning-address domain casing", () => {
    expect(resolveNpubCashServerBaseUrl("alice@Linky.Fit")).toBe(
      "https://npub.linky.fit",
    );
  });

  it("falls back to npub.cash for unsupported or invalid addresses", () => {
    expect(resolveNpubCashServerBaseUrl("alice@example.com")).toBe(
      "https://npub.cash",
    );
    expect(resolveNpubCashServerBaseUrl("not-an-address")).toBe(
      "https://npub.cash",
    );
  });
});
