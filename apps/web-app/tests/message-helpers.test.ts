import { describe, expect, it } from "vitest";
import type { LocalNostrMessage } from "../src/app/types/appTypes";
import {
  buildKnownNostrMessageIdentityIndex,
  dedupeNostrMessagesByPriority,
  hasKnownNostrMessageIdentity,
} from "../src/app/hooks/messages/messageHelpers";

const makeMessage = (
  id: string,
  overrides?: Partial<LocalNostrMessage>,
): LocalNostrMessage => ({
  id,
  contactId: "contact-1",
  content: `message-${id}`,
  createdAtSec: Number(id) || 1,
  direction: "in",
  pubkey: "pub-1",
  rumorId: `rumor-${id}`,
  wrapId: `wrap-${id}`,
  ...overrides,
});

describe("dedupeNostrMessagesByPriority", () => {
  it("prefers wrap-id identity over client-id and rumor fallback", () => {
    const deduped = dedupeNostrMessagesByPriority([
      makeMessage("1", {
        wrapId: "wrap-fixed",
        clientId: "client-fixed",
        rumorId: "rumor-fixed",
      }),
      makeMessage("2", {
        wrapId: "wrap-fixed",
        rumorId: "rumor-other",
      }),
      makeMessage("3", {
        wrapId: "wrap-other",
        clientId: "client-fixed",
        rumorId: "rumor-third",
      }),
    ]);

    expect(deduped).toHaveLength(1);
    expect(deduped[0]?.wrapId).toBe("wrap-fixed");
    expect(deduped[0]?.clientId).toBe("client-fixed");
  });
});

describe("known nostr message identity index", () => {
  it("keeps every raw wrap id even when the display dedupe would merge rows", () => {
    const rawMessages = [
      makeMessage("1", {
        rumorId: "rumor-fixed",
        wrapId: "wrap-original",
      }),
      makeMessage("2", {
        rumorId: "rumor-fixed",
        wrapId: "wrap-rewrapped",
      }),
    ];

    expect(dedupeNostrMessagesByPriority(rawMessages)).toHaveLength(1);

    const index = buildKnownNostrMessageIdentityIndex(rawMessages);

    expect(
      hasKnownNostrMessageIdentity(index, { wrapId: "wrap-original" }),
    ).toBe(true);
    expect(
      hasKnownNostrMessageIdentity(index, { wrapId: "wrap-rewrapped" }),
    ).toBe(true);
    expect(
      hasKnownNostrMessageIdentity(index, {
        contactId: "contact-1",
        direction: "in",
        rumorId: "rumor-fixed",
      }),
    ).toBe(true);
  });

  it("does not treat pending outgoing messages as confirmed relay events", () => {
    const index = buildKnownNostrMessageIdentityIndex([
      makeMessage("1", {
        clientId: "client-pending",
        direction: "out",
        rumorId: "rumor-pending",
        status: "pending",
        wrapId: "pending:local",
      }),
    ]);

    expect(
      hasKnownNostrMessageIdentity(index, {
        clientId: "client-pending",
        contactId: "contact-1",
        direction: "out",
        rumorId: "rumor-pending",
        wrapId: "wrap-real",
      }),
    ).toBe(false);
  });
});
