import { describe, expect, it } from "vitest";
import {
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
});
