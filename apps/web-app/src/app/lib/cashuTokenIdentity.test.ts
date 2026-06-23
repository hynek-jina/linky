import { describe, expect, it } from "vitest";
import {
  createCashuTokenId,
  hasMatchingCashuToken,
  readCashuTokenAliases,
} from "./cashuTokenIdentity";

describe("readCashuTokenAliases", () => {
  it("dedupes raw and canonical token aliases", () => {
    expect(
      readCashuTokenAliases({
        rawToken: " cashu-a ",
        token: "cashu-a",
      }),
    ).toEqual(["cashu-a"]);
  });
});

describe("hasMatchingCashuToken", () => {
  it("matches active rows by token alias", () => {
    expect(
      hasMatchingCashuToken(
        [
          {
            token: "cashu-active-token",
          },
        ],
        {
          rawToken: "cashu-active-token",
          token: "cashu-next-token",
        },
      ),
    ).toBe(true);
  });

  it("ignores soft-deleted rows", () => {
    expect(
      hasMatchingCashuToken(
        [
          {
            isDeleted: "1",
            token: "cashu-deleted-token",
          },
        ],
        {
          token: "cashu-deleted-token",
        },
      ),
    ).toBe(false);
  });

  it("matches the original token through its deterministic row id", () => {
    const originalToken = "cashu-original-token";

    expect(
      hasMatchingCashuToken(
        [
          {
            id: createCashuTokenId(originalToken),
            token: "cashu-accepted-token",
          },
        ],
        { token: originalToken },
      ),
    ).toBe(true);
  });

  it("keeps a soft-deleted deterministic id reserved", () => {
    const token = "cashu-deleted-deterministic-token";

    expect(
      hasMatchingCashuToken(
        [{ id: createCashuTokenId(token), isDeleted: "1", token }],
        { token },
      ),
    ).toBe(true);
  });
});
