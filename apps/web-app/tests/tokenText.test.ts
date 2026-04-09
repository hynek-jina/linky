import { describe, expect, it } from "vitest";
import { extractCashuTokenFromText } from "../src/app/lib/tokenText";

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

describe("extractCashuTokenFromText", () => {
  it("extracts a scanned cashu deep link token", () => {
    const token = buildCashuToken();

    expect(extractCashuTokenFromText(`cashu://${token}`)).toBe(token);
    expect(extractCashuTokenFromText(`web+cashu://${token}`)).toBe(token);
  });

  it("extracts a token from wallet deeplink URLs", () => {
    const token = buildCashuToken();

    expect(
      extractCashuTokenFromText(`https://app.linky.fit/#wallet?cashu=${token}`),
    ).toBe(token);
    expect(
      extractCashuTokenFromText(`https://app.linky.fit/cashu/${token}`),
    ).toBe(token);
  });
});
