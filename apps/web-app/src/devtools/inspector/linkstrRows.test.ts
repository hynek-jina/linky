import {
  ClientId,
  Emoji,
  InboxRouted,
  InboxWrapDeduped,
  NoRelayReachable,
  OperationFailed,
  OperationSucceeded,
  Pubkey,
  ReactionAdded,
  ReactionDraft,
  RelayPublishResult,
  RelayUrl,
  RumorId,
  UnixSeconds,
  WireEventReceived,
  WirePublished,
  WrapDelivery,
  WrapDropped,
  WrapId,
} from "@linky/linkstr";
import { getPublicKey } from "nostr-tools";
import { describe, expect, it } from "vitest";
import { linkstrEventToRow } from "./linkstrRows";

const pubkey = Pubkey.make(getPublicKey(new Uint8Array(32).fill(7)));
const relay = RelayUrl.make("wss://relay.test");
const rumorId = RumorId.make("ab".repeat(32));
const clientId = ClientId.make("client-1");
const sentAt = UnixSeconds.make(1_754_000_000);
const selfWrapId = WrapId.make("11".repeat(32));
const recipientWrapId = WrapId.make("22".repeat(32));

const delivery = (wrapId: WrapId) =>
  new WrapDelivery({ wrapId, acceptedBy: [relay], rejectedBy: [] });

const draft = new ReactionDraft({
  to: pubkey,
  target: rumorId,
  targetKind: "text",
  targetAuthor: pubkey,
  emoji: Emoji.make("🔥"),
});

describe("linkstrEventToRow", () => {
  it("links a succeeded operation to both wrap copies", () => {
    const row = linkstrEventToRow(
      new OperationSucceeded({
        name: "reactions.react",
        params: draft,
        rumorId,
        clientId,
        sentAt,
        selfCopy: delivery(selfWrapId),
        recipientCopy: delivery(recipientWrapId),
      }),
      1000,
    );

    expect(row).toMatchObject({
      at: 1000,
      channel: "operation",
      tag: "reactions.react",
      links: { rumorId, clientId, wrapIds: [selfWrapId, recipientWrapId] },
    });
    expect(row.summary).toContain("react 🔥");
  });

  it("extracts links from a typed delivery error", () => {
    const row = linkstrEventToRow(
      new OperationFailed({
        name: "reactions.react",
        params: draft,
        error: new NoRelayReachable({
          rumorId,
          clientId,
          sentAt,
          selfCopy: delivery(selfWrapId),
          recipientCopy: delivery(recipientWrapId),
        }),
      }),
      1000,
    );

    expect(row.summary).toContain("failed: NoRelayReachable");
    expect(row.links).toEqual({
      rumorId,
      clientId,
      wrapIds: [selfWrapId, recipientWrapId],
    });
  });

  it("summarizes wire publishes with relay acceptance counts", () => {
    const row = linkstrEventToRow(
      new WirePublished({
        wrapId: selfWrapId,
        wrap: { id: selfWrapId },
        results: [
          new RelayPublishResult({ relay, accepted: true, detail: null }),
          new RelayPublishResult({ relay, accepted: false, detail: "nope" }),
        ],
      }),
      1000,
    );

    expect(row.channel).toBe("wire");
    expect(row.summary).toContain("1/2 relays accepted");
    expect(row.links).toEqual({ wrapIds: [selfWrapId] });
  });

  it("reads id and kind out of a raw received event", () => {
    const row = linkstrEventToRow(
      new WireEventReceived({
        relay,
        event: { id: selfWrapId, kind: 1059, content: "x" },
      }),
      1000,
    );

    expect(row.summary).toContain("gift wrap (1059)");
    expect(row.links).toEqual({ relay, wrapIds: [selfWrapId] });

    const malformed = linkstrEventToRow(
      new WireEventReceived({ relay, event: "garbage" }),
      1000,
    );
    expect(malformed.summary).toBe(`event ← ${relay}`);
    expect(malformed.links).toEqual({ relay });
  });

  it("names the routed fact and its rumor id", () => {
    const row = linkstrEventToRow(
      new InboxRouted({
        wrapId: recipientWrapId,
        rumorKind: 7,
        event: new ReactionAdded({
          reactionId: rumorId,
          target: rumorId,
          from: pubkey,
          emoji: Emoji.make("👍"),
          sentAt,
        }),
      }),
      1000,
    );

    expect(row.summary).toContain("ReactionAdded 👍");
    expect(row.links).toEqual({ rumorId, wrapIds: [recipientWrapId] });
  });

  it("surfaces unknown rumor kinds by name on the drop path", () => {
    const row = linkstrEventToRow(
      new InboxRouted({
        wrapId: recipientWrapId,
        rumorKind: 14,
        event: new WrapDropped({
          wrapId: recipientWrapId,
          reason: "unsupported-kind",
        }),
      }),
      1000,
    );

    expect(row.summary).toBe(
      "WrapDropped unsupported-kind (rumor chat message (14))",
    );
    expect(row.links).toEqual({ wrapIds: [recipientWrapId] });
  });

  it("marks cross-relay dedupes", () => {
    const row = linkstrEventToRow(
      new InboxWrapDeduped({ wrapId: selfWrapId }),
      1000,
    );
    expect(row.summary).toContain("deduped");
    expect(row.links).toEqual({ wrapIds: [selfWrapId] });
  });
});
