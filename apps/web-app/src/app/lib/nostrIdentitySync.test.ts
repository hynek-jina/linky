import { describe, expect, it } from "vitest";
import {
  ACTIVE_NOSTR_IDENTITY_ROW_ID,
  resolveSyncedNostrIdentity,
} from "./nostrIdentitySync";

const makeIdentityRow = (
  ownerId: string,
  nsec: string,
  source: "custom" | "derived" = "custom",
) => ({
  id: ACTIVE_NOSTR_IDENTITY_ROW_ID,
  nsec,
  npub: `${nsec}-npub`,
  ownerId,
  source,
  switchedAtSec: 123,
});

describe("resolveSyncedNostrIdentity", () => {
  it("prefers the dedicated identity owner over a legacy messages owner", () => {
    const resolution = resolveSyncedNostrIdentity(
      [
        makeIdentityRow("messages-0-owner", "legacy-nsec"),
        makeIdentityRow("identity-owner", "current-nsec"),
      ],
      "identity-owner",
      new Set(["messages-0-owner"]),
    );

    expect(resolution.identity?.nsec).toBe("current-nsec");
    expect(resolution.shouldMigrateLegacyIdentity).toBe(false);
  });

  it("falls back to a legacy messages owner and requests migration", () => {
    const resolution = resolveSyncedNostrIdentity(
      [makeIdentityRow("messages-0-owner", "legacy-nsec")],
      "identity-owner",
      new Set(["messages-0-owner", "messages-1-owner"]),
    );

    expect(resolution.identity).toMatchObject({
      nsec: "legacy-nsec",
      ownerId: "messages-0-owner",
      source: "custom",
      switchedAtSec: 123,
    });
    expect(resolution.shouldMigrateLegacyIdentity).toBe(true);
  });

  it("treats legacy rows without a source as custom identities", () => {
    const resolution = resolveSyncedNostrIdentity(
      [
        {
          id: ACTIVE_NOSTR_IDENTITY_ROW_ID,
          nsec: "old-custom-nsec",
          ownerId: "legacy-meta-owner",
        },
      ],
      "identity-owner",
      new Set(["legacy-meta-owner"]),
    );

    expect(resolution.identity).toMatchObject({
      nsec: "old-custom-nsec",
      source: "custom",
    });
    expect(resolution.shouldMigrateLegacyIdentity).toBe(true);
  });

  it("ignores identities outside the dedicated and visible legacy owners", () => {
    const resolution = resolveSyncedNostrIdentity(
      [makeIdentityRow("unrelated-owner", "other-nsec")],
      "identity-owner",
      new Set(["messages-0-owner"]),
    );

    expect(resolution.identity).toBeNull();
    expect(resolution.shouldMigrateLegacyIdentity).toBe(false);
  });
});
