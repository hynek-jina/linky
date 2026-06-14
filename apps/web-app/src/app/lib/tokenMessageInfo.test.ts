import { describe, expect, it } from "vitest";
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

  it("does not treat failed accept attempts as already known", () => {
    const token = buildCashuToken();

    expect(
      getCashuTokenMessageInfo(token, [{ rawToken: token, state: "error" }])
        ?.isValid,
    ).toBe(true);
  });
});
