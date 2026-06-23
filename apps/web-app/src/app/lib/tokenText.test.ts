import { describe, expect, it } from "vitest";
import { extractCashuTokenMeta } from "./tokenText";

const buildCashuToken = (): string => {
  const payload = JSON.stringify({
    token: [
      {
        mint: "https://mint.example",
        proofs: [
          { amount: 8, secret: "secret-a", C: "c-a", id: "keyset" },
          { amount: 13, secret: "secret-b", C: "c-b", id: "keyset" },
        ],
      },
    ],
  });
  const base64Url = btoa(payload)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  return `cashuA${base64Url}`;
};

describe("extractCashuTokenMeta", () => {
  it("derives mint, unit, and amount from the token", () => {
    const token = buildCashuToken();

    expect(extractCashuTokenMeta({ token })).toEqual({
      tokenText: token,
      mint: "https://mint.example",
      unit: "sat",
      amount: 21,
    });
  });

  it("prefers token metadata over deprecated stored snapshots", () => {
    const token = buildCashuToken();

    expect(
      extractCashuTokenMeta({
        token,
        mint: "https://stale.example",
        unit: "usd",
        amount: 999,
      }),
    ).toEqual({
      tokenText: token,
      mint: "https://mint.example",
      unit: "sat",
      amount: 21,
    });
  });
});
