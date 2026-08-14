import { Effect, Either, Exit, Layer } from "effect";
import { generateSecretKey, getPublicKey } from "nostr-tools";
import {
  ClientId,
  NostrSecretKey,
  Pubkey,
  RelayUrl,
  RumorId,
} from "../domain/primitives";
import { unwrapToRumor } from "../internal/giftWrap";
import {
  firstTagValue,
  SignedWrapEvent,
  tagValues,
} from "../internal/nostrEvent";
import { LinkstrIdentity } from "../services/LinkstrIdentity";
import type { LinkstrIdentityService } from "../services/LinkstrIdentity";
import { NostrTransport, RelayPublishResult } from "../services/NostrTransport";
import { RelayPolicy } from "../services/RelayPolicy";
import { Emoji, ReactionDraft, RetractionDraft } from "./domain";
import { Reactions } from "./Reactions";

const makeIdentity = (): LinkstrIdentityService => {
  const secretKey = NostrSecretKey.make(generateSecretKey());
  return { pubkey: Pubkey.make(getPublicKey(secretKey)), secretKey };
};

const alice = makeIdentity();
const bob = makeIdentity();

const relayA = RelayUrl.make("wss://relay-a.test");
const relayB = RelayUrl.make("wss://relay-b.test");

const draft = new ReactionDraft({
  to: bob.pubkey,
  target: RumorId.make("ab".repeat(32)),
  targetKind: "image",
  targetAuthor: bob.pubkey,
  emoji: Emoji.make("🔥"),
  clientId: ClientId.make("client-42"),
});

const recipientOf = (wrap: SignedWrapEvent): string | null =>
  firstTagValue(wrap.tags, "p");

interface PublishedWrap {
  readonly relays: ReadonlyArray<RelayUrl>;
  readonly wrap: SignedWrapEvent;
}

/** Transport stub: relay outcomes decided per wrap by its recipient. */
const stubTransport = (
  published: Array<PublishedWrap>,
  acceptFor: (recipient: string | null, relay: RelayUrl) => boolean,
): Layer.Layer<NostrTransport> =>
  Layer.succeed(NostrTransport, {
    publish: (relays, wrap) =>
      Effect.sync(() => {
        if (!(wrap instanceof SignedWrapEvent)) {
          throw new Error("reactions publish only gift wraps");
        }
        published.push({ relays, wrap });
        return relays.map(
          (relay) =>
            new RelayPublishResult({
              relay,
              accepted: acceptFor(recipientOf(wrap), relay),
              detail: acceptFor(recipientOf(wrap), relay) ? null : "blocked",
            }),
        );
      }),
    subscribe: () => Effect.die("subscribe not under test"),
    fetch: () => Effect.die("fetch not under test"),
  });

const runWith = <A, E>(
  transport: Layer.Layer<NostrTransport>,
  program: Effect.Effect<A, E, Reactions>,
): Promise<Exit.Exit<A, E>> => {
  const dependencies = Layer.mergeAll(
    LinkstrIdentity.fromSecretKey(alice.secretKey),
    RelayPolicy.fixed({
      readRelays: [relayA, relayB],
      writeRelays: [relayA, relayB],
    }),
    transport,
  );
  return Effect.runPromiseExit(
    program.pipe(
      Effect.provide(Reactions.Default.pipe(Layer.provide(dependencies))),
    ),
  );
};

describe("Reactions.react", () => {
  it("publishes one wrap per copy and returns a full receipt", async () => {
    const published: Array<PublishedWrap> = [];
    const exit = await runWith(
      stubTransport(published, () => true),
      Effect.gen(function* () {
        const reactions = yield* Reactions;
        return yield* reactions.react(draft);
      }),
    );

    expect(Exit.isSuccess(exit)).toBe(true);
    if (!Exit.isSuccess(exit)) return;
    const receipt = exit.value;

    expect(receipt.clientId).toBe("client-42");
    expect(receipt.selfCopy.acceptedBy).toEqual([relayA, relayB]);
    expect(receipt.recipientCopy.acceptedBy).toEqual([relayA, relayB]);

    expect(published).toHaveLength(2);
    const recipients = published.map(({ wrap }) => recipientOf(wrap));
    expect(recipients).toContain(alice.pubkey);
    expect(recipients).toContain(bob.pubkey);

    // Both copies must decrypt to the same rumor: the receipt's reactionId.
    for (const { wrap } of published) {
      const key =
        recipientOf(wrap) === alice.pubkey ? alice.secretKey : bob.secretKey;
      const rumor = Either.getOrThrow(unwrapToRumor(wrap, key));
      expect(rumor.id).toBe(receipt.reactionId);
      expect(rumor.kind).toBe(7);
      expect(rumor.content).toBe("🔥");
      expect(firstTagValue(rumor.tags, "k")).toBe("15");
      expect(firstTagValue(rumor.tags, "client")).toBe("client-42");
      expect(tagValues(rumor.tags, "p")).toEqual([
        bob.pubkey,
        bob.pubkey,
        alice.pubkey,
      ]);
    }
  });

  it("fails with RecipientNotReached when only the self copy lands", async () => {
    const exit = await runWith(
      stubTransport([], (recipient) => recipient === alice.pubkey),
      Effect.gen(function* () {
        const reactions = yield* Reactions;
        return yield* reactions.react(draft);
      }),
    );

    expect(exit).toEqual(
      Exit.fail(
        expect.objectContaining({
          _tag: "RecipientNotReached",
          clientId: "client-42",
          recipientCopy: expect.objectContaining({
            acceptedBy: [],
            rejectedBy: [
              expect.objectContaining({ relay: relayA, detail: "blocked" }),
              expect.objectContaining({ relay: relayB, detail: "blocked" }),
            ],
          }),
        }),
      ),
    );
  });

  it("fails with NoRelayReachable when nothing lands", async () => {
    const exit = await runWith(
      stubTransport([], () => false),
      Effect.gen(function* () {
        const reactions = yield* Reactions;
        return yield* reactions.react(draft);
      }),
    );

    expect(exit).toEqual(
      Exit.fail(
        expect.objectContaining({
          _tag: "NoRelayReachable",
          clientId: "client-42",
          selfCopy: expect.objectContaining({ acceptedBy: [] }),
          recipientCopy: expect.objectContaining({ acceptedBy: [] }),
        }),
      ),
    );
  });
});

describe("Reactions.retract", () => {
  it("publishes a kind-5 rumor referencing the reactions", async () => {
    const published: Array<PublishedWrap> = [];
    const reactionIds: [RumorId, RumorId] = [
      RumorId.make("cd".repeat(32)),
      RumorId.make("ef".repeat(32)),
    ];
    const exit = await runWith(
      stubTransport(published, () => true),
      Effect.gen(function* () {
        const reactions = yield* Reactions;
        return yield* reactions.retract(
          new RetractionDraft({ to: bob.pubkey, reactionIds }),
        );
      }),
    );

    expect(Exit.isSuccess(exit)).toBe(true);
    if (!Exit.isSuccess(exit)) return;

    expect(published).toHaveLength(2);
    const selfPublished = published.find(
      ({ wrap }) => recipientOf(wrap) === alice.pubkey,
    );
    expect(selfPublished).toBeDefined();
    if (!selfPublished) return;
    const rumor = Either.getOrThrow(
      unwrapToRumor(selfPublished.wrap, alice.secretKey),
    );
    expect(rumor.kind).toBe(5);
    expect(rumor.content).toBe("");
    expect(tagValues(rumor.tags, "e")).toEqual(reactionIds);
    expect(rumor.id).toBe(exit.value.retractionId);
    // A generated clientId still travels on the wire for echo reconciliation.
    expect(firstTagValue(rumor.tags, "client")).toBe(exit.value.clientId);
  });
});
