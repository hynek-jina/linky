import { afterEach, describe, expect, it, vi } from "vitest";
import {
  finalizeOwnLightningAddressClaim,
  getOwnLightningAddressInputCandidate,
  getOwnLightningAddressFromUsername,
  getOwnLightningUsernameValidationIssue,
  normalizeOwnLightningUsername,
  requestOwnLightningAddressClaimPreview,
} from "./npubCashUsernameClaim";

describe("npubCashUsernameClaim", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("normalizes usernames and validates the hosted format", () => {
    expect(normalizeOwnLightningUsername(" Alice42 ")).toBe("alice42");
    expect(getOwnLightningAddressFromUsername("Alice42")).toBe(
      "alice42@linky.fit",
    );
    expect(getOwnLightningUsernameValidationIssue("ab")).toBe("too_short");
    expect(getOwnLightningUsernameValidationIssue("alice-42")).toBe(
      "invalid_format",
    );
    expect(getOwnLightningUsernameValidationIssue("alice42")).toBeNull();
  });

  it("treats bare names as linky.fit lightning address candidates", () => {
    expect(getOwnLightningAddressInputCandidate(" Alice42 ")).toEqual({
      issue: null,
      lightningAddress: "alice42@linky.fit",
      username: "alice42",
    });
    expect(getOwnLightningAddressInputCandidate("Alice42@Linky.Fit")).toEqual({
      issue: null,
      lightningAddress: "alice42@linky.fit",
      username: "alice42",
    });
    expect(
      getOwnLightningAddressInputCandidate("alice@example.com"),
    ).toBeNull();
  });

  it("parses payment-required username previews", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              data: {
                paymentRequest: "lnbc1testinvoice",
                paymentToken: "payment-token-1",
              },
              error: true,
              message: "Payment required",
            }),
            {
              headers: { "Content-Type": "application/json" },
              status: 402,
            },
          ),
      ),
    );

    const result = await requestOwnLightningAddressClaimPreview({
      makeNip98AuthHeader: async () => "nip98-token",
      serverBaseUrl: "https://npub.linky.fit",
      username: "Alice42",
    });

    expect(result.kind).toBe("available");
    if (result.kind !== "available") return;
    expect(result.username).toBe("alice42");
    expect(result.lightningAddress).toBe("alice42@linky.fit");
    expect(result.paymentToken).toBe("payment-token-1");
    expect(result.invoice.invoice).toBe("lnbc1testinvoice");
  });

  it("parses username previews that are already set for the signed account", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: true,
              message: "Username already set",
            }),
            {
              headers: { "Content-Type": "application/json" },
              status: 400,
            },
          ),
      ),
    );

    const result = await requestOwnLightningAddressClaimPreview({
      makeNip98AuthHeader: async () => "nip98-token",
      serverBaseUrl: "https://npub.linky.fit",
      username: "Alice42",
    });

    expect(result).toEqual({
      kind: "already_set",
      message: "Username already set",
    });
  });

  it("treats repeated finalize responses as already set", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: true,
              message: "Username already set",
            }),
            {
              headers: { "Content-Type": "application/json" },
              status: 400,
            },
          ),
      ),
    );

    const result = await finalizeOwnLightningAddressClaim({
      makeNip98AuthHeader: async () => "nip98-token",
      paymentToken: "payment-token-1",
      serverBaseUrl: "https://npub.linky.fit",
      username: "alice42",
    });

    expect(result).toEqual({ kind: "already_set" });
  });
});
