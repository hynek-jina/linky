import { describe, expect, it } from "vitest";
import { getGenericMintIconUrl, getNextMintIconUrl } from "./mint";

describe("getNextMintIconUrl", () => {
  it("falls back to favicon before the generic placeholder", () => {
    expect(
      getNextMintIconUrl(
        "https://cdn.example/icon.png",
        "https://cashu.example",
      ),
    ).toBe("https://cashu.example/favicon.ico");
  });

  it("falls back to the generic placeholder after favicon fails", () => {
    expect(
      getNextMintIconUrl(
        "https://cashu.example/favicon.ico",
        "https://cashu.example",
      ),
    ).toBe(getGenericMintIconUrl());
  });

  it("returns null when the generic placeholder already failed", () => {
    expect(getNextMintIconUrl(getGenericMintIconUrl(), null)).toBe(null);
  });
});
