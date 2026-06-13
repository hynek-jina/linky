import * as Evolu from "@evolu/common";
import { describe, expect, it } from "vitest";
import {
  readCashuRowOwnerId,
  resolveCashuRowOwnerLane,
  resolveCashuTokenOwnerLaneById,
} from "./cashuOwnerLane";

const owner0 = Evolu.OwnerId.orThrow("aaaaaaaaaaaaaaaaaaaaaa");
const owner1 = Evolu.OwnerId.orThrow("bbbbbbbbbbbbbbbbbbbbbb");
const owner2 = Evolu.OwnerId.orThrow("cccccccccccccccccccccc");

describe("cashu owner lane helpers", () => {
  it("reads an owner id from an aggregated row", () => {
    expect(readCashuRowOwnerId({ ownerId: ` ${owner1} ` })).toBe(owner1);
  });

  it("resolves a row owner only when it is visible", () => {
    expect(
      resolveCashuRowOwnerLane({ ownerId: owner1 }, [owner0, owner1]),
    ).toBe(owner1);

    expect(resolveCashuRowOwnerLane({ ownerId: owner2 }, [owner0])).toBe(null);
  });

  it("resolves an update owner by token id before falling back", () => {
    expect(
      resolveCashuTokenOwnerLaneById(
        [
          { id: "token-a", ownerId: owner0 },
          { id: "token-b", ownerId: owner1 },
        ],
        "token-b",
        [owner0, owner1],
        owner2,
      ),
    ).toBe(owner1);

    expect(
      resolveCashuTokenOwnerLaneById(
        [{ id: "token-a", ownerId: owner0 }],
        "token-b",
        [owner0],
        owner2,
      ),
    ).toBe(owner2);
  });
});
