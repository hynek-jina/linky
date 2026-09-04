import * as Evolu from "@evolu/common";
import { describe, expect, it } from "vitest";
import { createCashuTokenRowFixture } from "../../testUtils/cashuTokenRow";
import {
  readCashuRowOwnerId,
  resolveCashuRowStoredOwnerLane,
} from "./cashuOwnerLane";

const owner1 = Evolu.OwnerId.orThrow("AQEBAQEBAQEBAQEBAQEBAQ");
const owner2 = Evolu.OwnerId.orThrow("AgICAgICAgICAgICAgICAg");

describe("cashu owner lane helpers", () => {
  it("reads an owner id from an aggregated row", () => {
    expect(
      readCashuRowOwnerId(createCashuTokenRowFixture({ ownerId: owner1 })),
    ).toBe(owner1);
  });

  it("resolves the stored row owner even when it is not visible", () => {
    expect(
      resolveCashuRowStoredOwnerLane(
        createCashuTokenRowFixture({ ownerId: owner2 }),
      ),
    ).toBe(owner2);
  });
});
