import { describe, expect, it } from "vitest";
import { getUnknownErrorMessage } from "./unknown";

describe("getUnknownErrorMessage", () => {
  it("preserves structured validation errors", () => {
    expect(
      getUnknownErrorMessage(
        { type: "Object", errors: [{ key: "id", type: "UnexpectedKey" }] },
        "unknown",
      ),
    ).toBe('{"type":"Object","errors":[{"key":"id","type":"UnexpectedKey"}]}');
  });
});
