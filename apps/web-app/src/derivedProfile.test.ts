import { describe, expect, it } from "vitest";
import {
  cycleGeneratedAvatar,
  deriveDefaultLightningAddress,
  deriveDefaultProfile,
  deriveGeneratedAvatar,
  omitSyntheticContactLightningAddress,
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

  it("omits synthetic default linky.fit addresses for the same npub", () => {
    expect(
      omitSyntheticContactLightningAddress(
        "npub1alice@linky.fit",
        "npub1alice",
      ),
    ).toBe("");
    expect(
      omitSyntheticContactLightningAddress(
        "Npub1Alice@Linky.Fit",
        "npub1alice",
      ),
    ).toBe("");
  });

  it("keeps real or unrelated lightning addresses intact", () => {
    expect(
      omitSyntheticContactLightningAddress("alice@linky.fit", "npub1alice"),
    ).toBe("alice@linky.fit");
    expect(
      omitSyntheticContactLightningAddress(
        "npub1alice@example.com",
        "npub1alice",
      ),
    ).toBe("npub1alice@example.com");
  });
});

describe("derivedProfile avatar defaults", () => {
  it("starts generated avatars without facial hair", () => {
    const generated = deriveGeneratedAvatar("npub1alice");
    const url = new URL(generated.pictureUrl);

    expect(url.searchParams.get("facialHairProbability")).toBe("0");
  });

  it("shows facial hair on the first beard edit", () => {
    const generated = deriveGeneratedAvatar("npub1alice");
    const edited = cycleGeneratedAvatar(generated.selection, "facialHair");
    const url = new URL(edited.pictureUrl);

    expect(url.searchParams.get("facialHairProbability")).toBe("100");
  });
});
