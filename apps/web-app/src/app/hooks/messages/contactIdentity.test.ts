import { describe, expect, it } from "vitest";
import {
  buildUnknownContactId,
  readUnknownContactIdPubkey,
} from "./contactIdentity";

describe("unknown contact ids", () => {
  it("round-trips the peer pubkey", () => {
    const pubkey = "a".repeat(64);
    const contactId = buildUnknownContactId(pubkey);

    expect(contactId).not.toBeNull();
    expect(readUnknownContactIdPubkey(contactId)).toBe(pubkey);
  });

  it("rejects malformed and known contact ids", () => {
    expect(readUnknownContactIdPubkey("unknown:not-a-pubkey")).toBeNull();
    expect(readUnknownContactIdPubkey("contact-id")).toBeNull();
  });
});
