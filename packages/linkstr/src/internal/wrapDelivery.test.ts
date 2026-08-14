import { Effect, Exit } from "effect";
import { generateSecretKey, getPublicKey } from "nostr-tools";
import { NoRelayReachable } from "../domain/errors";
import {
  ClientId,
  NostrSecretKey,
  Pubkey,
  RelayUrl,
  UnixSeconds,
} from "../domain/primitives";
import type { LinkstrIdentityService } from "../services/LinkstrIdentity";
import {
  RelayPublishResult,
  type NostrTransportService,
} from "../services/NostrTransport";
import { firstTagValue, SignedWrapEvent } from "./nostrEvent";
import { rumorWithHash } from "./nostrEvent";
import { deliverRumorToPeer } from "./wrapDelivery";

const makeIdentity = (): LinkstrIdentityService => {
  const secretKey = NostrSecretKey.make(generateSecretKey());
  return { pubkey: Pubkey.make(getPublicKey(secretKey)), secretKey };
};

const alice = makeIdentity();
const bob = makeIdentity();
const relay = RelayUrl.make("wss://relay.test");
const clientId = ClientId.make("client-42");
const sentAt = UnixSeconds.make(1_700_000_000);

const rumor = rumorWithHash({
  pubkey: alice.pubkey,
  created_at: sentAt,
  kind: 14,
  tags: [
    ["p", bob.pubkey],
    ["p", alice.pubkey],
    ["client", clientId],
  ],
  content: "hello",
});

const recipientOf = (wrap: SignedWrapEvent): string | null =>
  firstTagValue(wrap.tags, "p");

const stubTransport = (
  publishedRecipients: Array<string | null>,
  acceptFor: (recipient: string | null) => boolean,
): NostrTransportService => ({
  publish: (relays, wrap) =>
    Effect.sync(() => {
      if (!(wrap instanceof SignedWrapEvent)) {
        throw new Error("delivery publishes only gift wraps");
      }
      const recipient = recipientOf(wrap);
      publishedRecipients.push(recipient);
      return relays.map(
        (r) =>
          new RelayPublishResult({
            relay: r,
            accepted: acceptFor(recipient),
            detail: acceptFor(recipient) ? null : "blocked",
          }),
      );
    }),
  subscribe: () => Effect.die("unused"),
  fetch: () => Effect.die("unused"),
});

const deliver = (
  transport: NostrTransportService,
  order?: "parallel" | "recipientFirst",
) =>
  Effect.runPromiseExit(
    deliverRumorToPeer(
      {
        identity: alice,
        transport,
        relayPolicy: { readRelays: [relay], writeRelays: [relay] },
      },
      {
        rumor,
        peer: bob.pubkey,
        clientId,
        sentAt,
        ...(order === undefined ? {} : { order }),
      },
    ),
  );

describe("deliverRumorToPeer with order recipientFirst", () => {
  it("publishes the recipient copy before the self copy", async () => {
    const publishedRecipients: Array<string | null> = [];
    const exit = await deliver(
      stubTransport(publishedRecipients, () => true),
      "recipientFirst",
    );

    expect(publishedRecipients).toEqual([bob.pubkey, alice.pubkey]);
    if (!Exit.isSuccess(exit)) throw new Error("expected success");
    expect(exit.value.recipientCopy.accepted).toBe(true);
    expect(exit.value.selfCopy.accepted).toBe(true);
  });

  it("never publishes the self copy when the recipient copy is rejected", async () => {
    const publishedRecipients: Array<string | null> = [];
    const exit = await deliver(
      stubTransport(publishedRecipients, () => false),
      "recipientFirst",
    );

    expect(publishedRecipients).toEqual([bob.pubkey]);
    if (!Exit.isFailure(exit)) throw new Error("expected failure");
    if (exit.cause._tag !== "Fail") throw new Error("expected typed failure");
    const failure = exit.cause.error;
    expect(failure).toBeInstanceOf(NoRelayReachable);
    expect(failure.selfCopy.acceptedBy).toEqual([]);
    expect(failure.selfCopy.rejectedBy).toEqual([]);
    expect(failure.recipientCopy.accepted).toBe(false);
  });

  it("still succeeds when only the best-effort self copy is rejected", async () => {
    const publishedRecipients: Array<string | null> = [];
    const exit = await deliver(
      stubTransport(
        publishedRecipients,
        (recipient) => recipient === bob.pubkey,
      ),
      "recipientFirst",
    );

    expect(publishedRecipients).toEqual([bob.pubkey, alice.pubkey]);
    if (!Exit.isSuccess(exit)) throw new Error("expected success");
    expect(exit.value.recipientCopy.accepted).toBe(true);
    expect(exit.value.selfCopy.accepted).toBe(false);
  });
});

describe("deliverRumorToPeer default order", () => {
  it("publishes both copies without sequencing", async () => {
    const publishedRecipients: Array<string | null> = [];
    const exit = await deliver(stubTransport(publishedRecipients, () => true));

    expect(publishedRecipients).toHaveLength(2);
    expect(publishedRecipients).toContain(bob.pubkey);
    expect(publishedRecipients).toContain(alice.pubkey);
    if (!Exit.isSuccess(exit)) throw new Error("expected success");
  });
});
