import { describe, expect, it } from "vitest";
import {
  findUniqueContactByLightningAddress,
  normalizeContactLightningAddress,
} from "./contactIdentity";

describe("contact identity", () => {
  it("normalizes lightning addresses case-insensitively", () => {
    expect(normalizeContactLightningAddress(" Alice@Linky.Fit ")).toBe(
      "alice@linky.fit",
    );
  });

  it("returns a contact only for an unambiguous lightning-address match", () => {
    const alice = { id: "alice", lnAddress: "alice@linky.fit" };
    const bob = { id: "bob", lnAddress: "bob@linky.fit" };

    expect(
      findUniqueContactByLightningAddress([alice, bob], "ALICE@LINKY.FIT"),
    ).toBe(alice);
    expect(
      findUniqueContactByLightningAddress(
        [alice, { id: "alice-copy", lnAddress: "Alice@Linky.Fit" }],
        "alice@linky.fit",
      ),
    ).toBeNull();
  });
});
