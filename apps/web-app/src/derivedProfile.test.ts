import { describe, expect, it } from "vitest";
import {
  deriveDefaultLightningAddress,
  deriveDefaultProfile,
  parseDefaultLightningAddressNpub,
} from "./derivedProfile";

describe("derivedProfile lightning address defaults", () => {
  it("uses linky.fit for new default lightning addresses", () => {
    expect(deriveDefaultLightningAddress("npub1alice")).toBe(
      "npub1alice@linky.fit",
    );
    expect(deriveDefaultProfile("npub1alice").lnAddress).toBe(
      "npub1alice@linky.fit",
    );
  });

  it("extracts npub values from the default linky.fit lightning address", () => {
    expect(parseDefaultLightningAddressNpub("npub1alice@linky.fit")).toBe(
      "npub1alice",
    );
    expect(parseDefaultLightningAddressNpub("npub1alice@Linky.Fit")).toBe(
      "npub1alice",
    );
  });

  it("ignores non-default lightning-address domains", () => {
    expect(parseDefaultLightningAddressNpub("npub1alice@npub.cash")).toBeNull();
    expect(
      parseDefaultLightningAddressNpub("npub1alice@example.com"),
    ).toBeNull();
  });
});
