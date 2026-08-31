import { describe, expect, it } from "vitest";
import {
  describeTaggedCashuError,
  formatStoredCashuError,
  isStoredCashuErrorTokenSpent,
} from "./cashuStoredError";

describe("describeTaggedCashuError", () => {
  it("maps linkshu receive failures to readable text", () => {
    expect(
      describeTaggedCashuError({ _tag: "TokenAlreadySpent", mint: "m" }),
    ).toBe("Token already spent");
    expect(
      describeTaggedCashuError({
        _tag: "MintUnreachable",
        mint: "m",
        detail: "timeout",
      }),
    ).toBe("Mint unreachable: timeout");
    expect(
      describeTaggedCashuError({ _tag: "MintUnreachable", detail: null }),
    ).toBe("Mint unreachable");
    expect(
      describeTaggedCashuError({
        _tag: "MintRejected",
        code: 20003,
        detail: "keyset inactive",
      }),
    ).toBe("Mint rejected the token: keyset inactive");
    expect(
      describeTaggedCashuError({ _tag: "TokenParseFailed", reason: "empty" }),
    ).toBe("Invalid token");
    expect(
      describeTaggedCashuError({ _tag: "LegacyError", detail: "old text" }),
    ).toBe("old text");
  });

  it("returns null for unknown tags and untagged values", () => {
    expect(describeTaggedCashuError({ _tag: "SomethingNew" })).toBeNull();
    expect(describeTaggedCashuError({ message: "boom" })).toBeNull();
    expect(describeTaggedCashuError("boom")).toBeNull();
    expect(describeTaggedCashuError(null)).toBeNull();
  });
});

describe("formatStoredCashuError", () => {
  it("decodes serialized tagged errors", () => {
    expect(
      formatStoredCashuError(
        JSON.stringify({ _tag: "TokenAlreadySpent", mint: "m" }),
      ),
    ).toBe("Token already spent");
  });

  it("passes legacy plain text through", () => {
    expect(formatStoredCashuError("Accept failed: boom")).toBe(
      "Accept failed: boom",
    );
  });

  it("keeps unknown tagged JSON verbatim rather than losing it", () => {
    const stored = JSON.stringify({ _tag: "FutureError", x: 1 });
    expect(formatStoredCashuError(stored)).toBe(stored);
  });

  it("returns null for empty and non-string values", () => {
    expect(formatStoredCashuError("  ")).toBeNull();
    expect(formatStoredCashuError(null)).toBeNull();
    expect(formatStoredCashuError(undefined)).toBeNull();
  });
});

describe("isStoredCashuErrorTokenSpent", () => {
  it("recognizes only the tagged already-spent failure", () => {
    expect(
      isStoredCashuErrorTokenSpent(
        JSON.stringify({ _tag: "TokenAlreadySpent", mint: "m" }),
      ),
    ).toBe(true);
    expect(
      isStoredCashuErrorTokenSpent(
        JSON.stringify({ _tag: "MintUnreachable", mint: "m", detail: null }),
      ),
    ).toBe(false);
    expect(isStoredCashuErrorTokenSpent("Token already spent")).toBe(false);
    expect(isStoredCashuErrorTokenSpent(null)).toBe(false);
  });
});
