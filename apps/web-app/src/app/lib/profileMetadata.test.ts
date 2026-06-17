import { describe, expect, it } from "vitest";
import {
  applyLightningAddressToProfileMetadata,
  buildKind0ProfileContent,
} from "./profileMetadata";

describe("applyLightningAddressToProfileMetadata", () => {
  it("adds matching NIP-05 metadata for claimed linky.fit addresses", () => {
    const next = applyLightningAddressToProfileMetadata(
      {
        displayName: "Alice",
        image: "https://example.com/alice.png",
        name: "alice",
        picture: "https://example.com/alice.png",
      },
      "Alice42@Linky.Fit",
    );

    expect(next).toEqual({
      lightningAddress: "Alice42@Linky.Fit",
      metadata: {
        displayName: "Alice",
        image: "https://example.com/alice.png",
        lud16: "Alice42@Linky.Fit",
        name: "alice",
        nip05: "alice42@linky.fit",
        picture: "https://example.com/alice.png",
      },
      nip05: "alice42@linky.fit",
    });
    expect(buildKind0ProfileContent(next.metadata)).toEqual({
      display_name: "Alice",
      image: "https://example.com/alice.png",
      lud16: "Alice42@Linky.Fit",
      name: "alice",
      nip05: "alice42@linky.fit",
      picture: "https://example.com/alice.png",
    });
  });

  it("preserves unrelated NIP-05 identifiers for non-default addresses", () => {
    const next = applyLightningAddressToProfileMetadata(
      {
        lud16: "old@linky.fit",
        name: "alice",
        nip05: "alice@nostr.example",
      },
      "alice@example.com",
    );

    expect(next.metadata).toEqual({
      lud16: "alice@example.com",
      name: "alice",
      nip05: "alice@nostr.example",
    });
  });
});
