import { describe, expect, it } from "vitest";
import { buildCashuDeepLink, buildCashuShareUrl } from "../src/utils/deepLinks";

const buildCashuToken = (): string => {
  const payload = JSON.stringify({
    token: [
      {
        mint: "https://mint.example",
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

describe("buildCashuShareUrl", () => {
  it("builds a public cashu landing page URL with the token in the hash", () => {
    const token = buildCashuToken();

    expect(buildCashuDeepLink(token)).toBe(`cashu://${token}`);
    expect(buildCashuShareUrl(token)).toBe(
      `https://linky.fit/cashu/#${encodeURIComponent(token)}`,
    );
  });

  it("rejects invalid tokens", () => {
    expect(buildCashuShareUrl("not-a-token")).toBeNull();
  });
});
