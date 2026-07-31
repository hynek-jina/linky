import { describe, expect, it } from "vitest";
import { createCashuTokenRowFixture } from "../../../testUtils/cashuTokenRow";
import { getEncounteredMintUrls, getMintInfoIconUrl } from "./mintInfoHelpers";

const buildCashuToken = (): string => {
  const payload = JSON.stringify({
    token: [
      {
        mint: "https://parsed.example",
        proofs: [{ amount: 21, secret: "secret", C: "c", id: "keyset" }],
      },
    ],
  });
  const base64Url = btoa(payload)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  return `cashuA${base64Url}`;
};

describe("getMintInfoIconUrl", () => {
  it("uses the direct icon URL returned by mint info", () => {
    expect(
      getMintInfoIconUrl(
        "https://cashu.example",
        JSON.stringify({ icon_url: "https://cdn.example/mint.png" }),
      ),
    ).toBe("https://cdn.example/mint.png");
  });

  it("resolves relative icon URLs against the mint URL", () => {
    expect(
      getMintInfoIconUrl(
        "https://mint.minibits.cash/Bitcoin",
        JSON.stringify({ icon_url: "/icons/bitcoin.png" }),
      ),
    ).toBe("https://mint.minibits.cash/icons/bitcoin.png");
  });

  it("finds nested icon fields in the info payload", () => {
    expect(
      getMintInfoIconUrl(
        "https://cashu.example",
        JSON.stringify({ metadata: { iconUrl: "./mint.webp" } }),
      ),
    ).toBe("https://cashu.example/mint.webp");
  });

  it("returns null for invalid JSON", () => {
    expect(getMintInfoIconUrl("https://cashu.example", "not-json")).toBe(null);
  });
});

describe("getEncounteredMintUrls", () => {
  it("uses accepted token metadata and ignores unavailable rows", () => {
    expect(
      getEncounteredMintUrls([
        createCashuTokenRowFixture({
          mint: "https://stale.example",
          state: "accepted",
          token: buildCashuToken(),
        }),
        createCashuTokenRowFixture({
          id: "error-token",
          mint: "https://error.example",
          state: "error",
        }),
        createCashuTokenRowFixture({
          id: "reserved-token",
          mint: "https://reserved.example",
          state: "reserved",
        }),
      ]),
    ).toEqual(["https://parsed.example"]);
  });
});
