import { describe, expect, it } from "vitest";
import { createCashuTokenId } from "./cashuTokenIdentity";
import { getCashuTokenMessageInfo } from "./tokenMessageInfo";

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

describe("getCashuTokenMessageInfo", () => {
  it("treats accepted matching tokens as already known", () => {
    const token = buildCashuToken();

    expect(
      getCashuTokenMessageInfo(token, [{ rawToken: token, state: "accepted" }])
        ?.isValid,
    ).toBe(false);
  });

  it("treats failed accept attempts as already known for auto-import", () => {
    const token = buildCashuToken();

    expect(
      getCashuTokenMessageInfo(token, [{ rawToken: token, state: "error" }])
        ?.isValid,
    ).toBe(false);
  });

  it("treats deleted failed tokens as already known for auto-import", () => {
    const token = buildCashuToken();

    expect(
      getCashuTokenMessageInfo(token, [
        { isDeleted: "1", rawToken: token, state: "error" },
      ])?.isValid,
    ).toBe(false);
  });

  it("recognizes an accepted token by the original token-derived id", () => {
    const token = buildCashuToken();

    expect(
      getCashuTokenMessageInfo(token, [
        { id: createCashuTokenId(token), token: "cashu-accepted-token" },
      ])?.isValid,
    ).toBe(false);
  });
});
