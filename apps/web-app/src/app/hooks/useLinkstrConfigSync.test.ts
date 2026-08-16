import { nip19 } from "nostr-tools";
import { describe, expect, it } from "vitest";

import { buildLinkstrConfig } from "./useLinkstrConfigSync";

const nsec = nip19.nsecEncode(
  Uint8Array.from({ length: 32 }, (_, index) => index + 1),
);

describe("buildLinkstrConfig", () => {
  it("passes the inspector gate to linkstr", () => {
    expect(
      buildLinkstrConfig(nsec, ["wss://relay.example"], false)?.inspector,
    ).toBe(false);
    expect(
      buildLinkstrConfig(nsec, ["wss://relay.example"], true)?.inspector,
    ).toBe(true);
  });
});
