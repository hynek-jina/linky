import { describe, expect, it } from "vitest";
import { isCashuRowCandidateBetter } from "./cashuRowPreference";

const ownerRank = new Map([
  ["cashu-0", 0],
  ["cashu-1", 1],
]);

describe("isCashuRowCandidateBetter", () => {
  it("lets a newer-lane tombstone suppress an older live duplicate", () => {
    expect(
      isCashuRowCandidateBetter({
        activeOwnerId: "cashu-1",
        candidate: { isDeleted: 1, ownerId: "cashu-1" },
        existing: { isDeleted: null, ownerId: "cashu-0" },
        ownerRank,
      }),
    ).toBe(true);
  });

  it("keeps a newer live re-import over an older tombstone", () => {
    expect(
      isCashuRowCandidateBetter({
        activeOwnerId: "cashu-1",
        candidate: { isDeleted: null, ownerId: "cashu-1" },
        existing: { isDeleted: 1, ownerId: "cashu-0" },
        ownerRank,
      }),
    ).toBe(true);
  });

  it("prefers a valid duplicate to an error in the same lane", () => {
    expect(
      isCashuRowCandidateBetter({
        activeOwnerId: "cashu-1",
        candidate: { ownerId: "cashu-1", state: "accepted" },
        existing: { ownerId: "cashu-1", state: "error" },
        ownerRank,
      }),
    ).toBe(true);
  });
});
