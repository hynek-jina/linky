import * as Evolu from "@evolu/common";
import { describe, expect, it } from "vitest";
import { createCashuTokenRowFixture } from "../../testUtils/cashuTokenRow";
import { createCashuTokenId } from "./cashuTokenIdentity";
import {
  readCashuRowOwnerId,
  resolveCashuRowOwnerLane,
  resolveCashuRowStoredOwnerLane,
  resolveCashuTokenStoredOwnerLaneById,
} from "./cashuOwnerLane";

const owner0 = Evolu.OwnerId.orThrow("AAAAAAAAAAAAAAAAAAAAAA");
const owner1 = Evolu.OwnerId.orThrow("AQEBAQEBAQEBAQEBAQEBAQ");
const owner2 = Evolu.OwnerId.orThrow("AgICAgICAgICAgICAgICAg");

describe("cashu owner lane helpers", () => {
  it("reads an owner id from an aggregated row", () => {
    expect(
      readCashuRowOwnerId(createCashuTokenRowFixture({ ownerId: owner1 })),
    ).toBe(owner1);
  });

  it("resolves a row owner only when it is visible", () => {
    expect(
      resolveCashuRowOwnerLane(
        createCashuTokenRowFixture({ ownerId: owner1 }),
        [owner0, owner1],
      ),
    ).toBe(owner1);

    expect(
      resolveCashuRowOwnerLane(
        createCashuTokenRowFixture({ ownerId: owner2 }),
        [owner0],
      ),
    ).toBe(null);
  });

  it("resolves the stored row owner even when it is not visible", () => {
    expect(
      resolveCashuRowStoredOwnerLane(
        createCashuTokenRowFixture({ ownerId: owner2 }),
      ),
    ).toBe(owner2);
  });

  it("resolves an update owner by token id before falling back", () => {
    const tokenAId = createCashuTokenId("token-a");
    const tokenBId = createCashuTokenId("token-b");

    expect(
      resolveCashuTokenStoredOwnerLaneById(
        [
          createCashuTokenRowFixture({ id: "token-a", ownerId: owner0 }),
          createCashuTokenRowFixture({ id: "token-b", ownerId: owner1 }),
        ],
        tokenBId,
        owner2,
      ),
    ).toBe(owner1);

    expect(
      resolveCashuTokenStoredOwnerLaneById(
        [createCashuTokenRowFixture({ id: "token-a", ownerId: owner0 })],
        tokenBId,
        owner2,
      ),
    ).toBe(owner2);

    expect(
      resolveCashuTokenStoredOwnerLaneById(
        [createCashuTokenRowFixture({ id: "token-a", ownerId: owner0 })],
        tokenAId,
        owner2,
      ),
    ).toBe(owner0);
  });
});
