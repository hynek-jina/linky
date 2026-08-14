import { Duration, Effect, Layer, Stream } from "effect";
import type { Scope } from "effect";
import { generateSecretKey, getEventHash, getPublicKey } from "nostr-tools";
import type { Event as NostrToolsEvent } from "nostr-tools";
import {
  ClientId,
  NostrSecretKey,
  Pubkey,
  RelayUrl,
  RumorId,
  UnixSeconds,
} from "../domain/primitives";
import { WrapInbox } from "../inbox/WrapInbox";
import { wrapRumorFor } from "../internal/giftWrap";
import { Rumor } from "../internal/nostrEvent";
import type { NostrTags } from "../internal/nostrEvent";
import { ProfileMetadata } from "../profiles/domain";
import { Profiles } from "../profiles/Profiles";
import { Reactions } from "../reactions/Reactions";
import { encodeReactionRumor } from "../reactions/codec";
import { Emoji, ReactionDraft, RetractionDraft } from "../reactions/domain";
import { LinkstrIdentity } from "../services/LinkstrIdentity";
import type { LinkstrIdentityService } from "../services/LinkstrIdentity";
import { NostrTransport, RelayPublishResult } from "../services/NostrTransport";
import type { NostrTransportService } from "../services/NostrTransport";
import { RelayPolicy } from "../services/RelayPolicy";
import { Inspector } from "./Inspector";
import type { InspectorEvent } from "./events";
import { inspectTransport } from "./inspectTransport";

const makeIdentity = (): LinkstrIdentityService => {
  const secretKey = NostrSecretKey.make(generateSecretKey());
  return { pubkey: Pubkey.make(getPublicKey(secretKey)), secretKey };
};

const alice = makeIdentity();
const bob = makeIdentity();

const relayA = RelayUrl.make("wss://relay-a.test");

const sentAt = UnixSeconds.make(1_754_000_000);

const draftFor = (emoji: string) =>
  new ReactionDraft({
    to: bob.pubkey,
    target: RumorId.make("ab".repeat(32)),
    targetKind: "text",
    targetAuthor: bob.pubkey,
    emoji: Emoji.make(emoji),
  });

const reactionWrapForAlice = (emoji: string) => {
  const rumor = encodeReactionRumor(
    new ReactionDraft({
      to: alice.pubkey,
      target: RumorId.make("ab".repeat(32)),
      targetKind: "text",
      targetAuthor: alice.pubkey,
      emoji: Emoji.make(emoji),
    }),
    bob.pubkey,
    sentAt,
    ClientId.make("client-1"),
  );
  return wrapRumorFor(rumor, bob.secretKey, alice.pubkey);
};

const chatWrapForAlice = () => {
  const fields = {
    pubkey: bob.pubkey,
    created_at: sentAt,
    kind: 14,
    tags: [["p", alice.pubkey]] satisfies NostrTags,
    content: "hello",
  };
  const rumor = new Rumor({ ...fields, id: getEventHash(fields) });
  return wrapRumorFor(rumor, bob.secretKey, alice.pubkey);
};

// Mirrors the linkstr-react runtime composition: vertical services over base
// services, the transport tapped, Inspector.live provided beneath everything.
const servicesWith = (transport: NostrTransportService) =>
  Layer.mergeAll(Reactions.Default, WrapInbox.Default, Profiles.Default).pipe(
    Layer.provideMerge(
      Layer.mergeAll(
        LinkstrIdentity.fromSecretKey(alice.secretKey),
        RelayPolicy.fixed({ readRelays: [relayA], writeRelays: [relayA] }),
        inspectTransport(Layer.succeed(NostrTransport, transport)),
      ),
    ),
    Layer.provideMerge(Inspector.live),
  );

const eventually = (predicate: () => boolean): Effect.Effect<void, Error> => {
  const poll: Effect.Effect<void> = Effect.suspend(() =>
    predicate()
      ? Effect.void
      : Effect.sleep(Duration.millis(2)).pipe(Effect.andThen(() => poll)),
  );
  return poll.pipe(
    Effect.timeoutFail({
      duration: Duration.seconds(2),
      onTimeout: () => new Error("condition not met within 2s"),
    }),
  );
};

const withInspected = <A, E>(
  transport: NostrTransportService,
  body: (
    collected: Array<InspectorEvent>,
  ) => Effect.Effect<A, E, Reactions | WrapInbox | Profiles | Scope.Scope>,
): Promise<A> =>
  Effect.gen(function* () {
    const inspector = yield* Inspector;
    const collected: Array<InspectorEvent> = [];
    yield* Effect.forkScoped(
      Stream.runForEach(inspector.events, (event) =>
        Effect.sync(() => collected.push(event)),
      ),
    );
    return yield* body(collected);
  }).pipe(
    Effect.scoped,
    Effect.provide(servicesWith(transport)),
    Effect.runPromise,
  );

const acceptingTransport = (
  published: Array<string>,
): NostrTransportService => ({
  publish: (relays, event) =>
    Effect.sync(() => {
      published.push(event.id);
      return relays.map(
        (relay) =>
          new RelayPublishResult({ relay, accepted: true, detail: null }),
      );
    }),
  subscribe: () => Effect.die("subscribe not under test"),
  fetch: () => Effect.die("fetch not under test"),
});

describe("Inspector", () => {
  it("emits the operation and its wire publishes, linked by wrap ids", async () => {
    const published: Array<string> = [];
    const draft = draftFor("👍");

    await withInspected(acceptingTransport(published), (collected) =>
      Effect.gen(function* () {
        const reactions = yield* Reactions;
        const receipt = yield* reactions.react(draft);
        yield* eventually(() => collected.length === 3);

        const wires = collected.filter(
          (event) => event._tag === "WirePublished",
        );
        expect(wires.map((event) => event.wrapId).sort()).toEqual(
          [...published].sort(),
        );
        expect(wires[0]?.results).toEqual([
          expect.objectContaining({ relay: relayA, accepted: true }),
        ]);

        const operation = collected.find(
          (event) => event._tag === "OperationSucceeded",
        );
        if (operation?._tag !== "OperationSucceeded") {
          throw new Error("no OperationSucceeded emitted");
        }
        expect(operation.name).toBe("reactions.react");
        expect(operation.params).toBe(draft);
        expect(operation.rumorId).toBe(receipt.reactionId);
        expect(operation.clientId).toBe(receipt.clientId);
        expect(
          [operation.selfCopy.wrapId, operation.recipientCopy.wrapId].sort(),
        ).toEqual([...published].sort());
      }),
    );
  });

  it("names retractions reactions.retract", async () => {
    await withInspected(acceptingTransport([]), (collected) =>
      Effect.gen(function* () {
        const reactions = yield* Reactions;
        const receipt = yield* reactions.retract(
          new RetractionDraft({
            to: bob.pubkey,
            reactionIds: [RumorId.make("cd".repeat(32))],
          }),
        );
        yield* eventually(() =>
          collected.some((event) => event._tag === "OperationSucceeded"),
        );
        expect(
          collected.find((event) => event._tag === "OperationSucceeded"),
        ).toEqual(
          expect.objectContaining({
            name: "reactions.retract",
            rumorId: receipt.retractionId,
          }),
        );
      }),
    );
  });

  it("emits OperationFailed with the delivery error", async () => {
    const rejectingTransport: NostrTransportService = {
      publish: (relays) =>
        Effect.succeed(
          relays.map(
            (relay) =>
              new RelayPublishResult({
                relay,
                accepted: false,
                detail: "nope",
              }),
          ),
        ),
      subscribe: () => Effect.die("subscribe not under test"),
      fetch: () => Effect.die("fetch not under test"),
    };
    const draft = draftFor("🔥");

    await withInspected(rejectingTransport, (collected) =>
      Effect.gen(function* () {
        const reactions = yield* Reactions;
        const error = yield* Effect.flip(reactions.react(draft));
        yield* eventually(() =>
          collected.some((event) => event._tag === "OperationFailed"),
        );

        const failed = collected.find(
          (event) => event._tag === "OperationFailed",
        );
        if (failed?._tag !== "OperationFailed") {
          throw new Error("no OperationFailed emitted");
        }
        expect(failed.name).toBe("reactions.react");
        expect(failed.params).toBe(draft);
        expect(failed.error).toBe(error);
      }),
    );
  });

  it("emits wire and inbox events for received wraps, dedupes, and names unknown kinds", async () => {
    const handlers: Array<(event: NostrToolsEvent) => void> = [];
    const transport: NostrTransportService = {
      publish: () => Effect.die("publish not under test"),
      subscribe: (_relay, _filter, onEvent) =>
        Effect.suspend(() => {
          handlers.push(onEvent);
          return Effect.never;
        }),
      fetch: () => Effect.die("fetch not under test"),
    };

    await withInspected(transport, (collected) =>
      Effect.gen(function* () {
        const inbox = yield* WrapInbox;
        const feed = yield* inbox.open();
        yield* Effect.forkScoped(Stream.runDrain(feed.events));
        yield* eventually(() => handlers.length === 1);

        const wrap = reactionWrapForAlice("👍");
        const chat = chatWrapForAlice();
        handlers[0]?.(wrap);
        handlers[0]?.(wrap);
        handlers[0]?.(chat);
        yield* eventually(
          () =>
            collected.filter((event) => event._tag === "InboxRouted").length ===
              2 && collected.some((event) => event._tag === "InboxWrapDeduped"),
        );

        expect(
          collected.find((event) => event._tag === "WireSubscribed"),
        ).toEqual(
          expect.objectContaining({
            relay: relayA,
            filter: { kinds: [1059], "#p": [alice.pubkey] },
          }),
        );
        expect(
          collected.filter((event) => event._tag === "WireEventReceived"),
        ).toHaveLength(3);
        expect(
          collected.filter((event) => event._tag === "InboxRouted"),
        ).toEqual([
          expect.objectContaining({
            wrapId: wrap.id,
            rumorKind: 7,
            event: expect.objectContaining({
              _tag: "ReactionAdded",
              emoji: "👍",
            }),
          }),
          expect.objectContaining({
            wrapId: chat.id,
            rumorKind: 14,
            event: expect.objectContaining({
              _tag: "WrapDropped",
              reason: "unsupported-kind",
            }),
          }),
        ]);
        expect(
          collected.find((event) => event._tag === "InboxWrapDeduped"),
        ).toEqual(expect.objectContaining({ wrapId: wrap.id }));
      }),
    );
  });

  it("emits the plain operation and its wire publish, linked by event id", async () => {
    const published: Array<string> = [];
    const metadata = new ProfileMetadata({ name: "alice" });

    await withInspected(acceptingTransport(published), (collected) =>
      Effect.gen(function* () {
        const profiles = yield* Profiles;
        const receipt = yield* profiles.publishProfile(metadata);
        yield* eventually(() => collected.length === 2);

        expect(
          collected.find((event) => event._tag === "WirePlainPublished"),
        ).toEqual(
          expect.objectContaining({
            eventId: receipt.eventId,
            kind: 0,
            results: [
              expect.objectContaining({ relay: relayA, accepted: true }),
            ],
          }),
        );
        expect(
          collected.find((event) => event._tag === "PlainOperationSucceeded"),
        ).toEqual(
          expect.objectContaining({
            name: "profiles.publishProfile",
            params: metadata,
            eventIds: [receipt.eventId],
            result: receipt,
          }),
        );
        expect(published).toEqual([receipt.eventId]);
      }),
    );
  });

  it("emits WireFetched for one-shot fetches and OperationFailed on fetch errors", async () => {
    const fetchingTransport: NostrTransportService = {
      publish: () => Effect.die("publish not under test"),
      subscribe: () => Effect.die("subscribe not under test"),
      fetch: (relay, filter) =>
        Effect.suspend(() => {
          expect(filter).toEqual({ kinds: [0, 30315], authors: [bob.pubkey] });
          return relay === relayA
            ? Effect.succeed([])
            : Effect.die("only relayA configured");
        }),
    };

    await withInspected(fetchingTransport, (collected) =>
      Effect.gen(function* () {
        const profiles = yield* Profiles;
        const result = yield* profiles.fetchProfile(bob.pubkey);
        yield* eventually(() =>
          collected.some((event) => event._tag === "PlainOperationSucceeded"),
        );

        expect(collected.find((event) => event._tag === "WireFetched")).toEqual(
          expect.objectContaining({ relay: relayA, events: [], detail: null }),
        );
        expect(
          collected.find((event) => event._tag === "PlainOperationSucceeded"),
        ).toEqual(
          expect.objectContaining({
            name: "profiles.fetchProfile",
            params: bob.pubkey,
            eventIds: [],
            result,
          }),
        );
      }),
    );
  });

  it("reports authentication failures with a null rumor kind", async () => {
    const handlers: Array<(event: NostrToolsEvent) => void> = [];
    const transport: NostrTransportService = {
      publish: () => Effect.die("publish not under test"),
      subscribe: (_relay, _filter, onEvent) =>
        Effect.suspend(() => {
          handlers.push(onEvent);
          return Effect.never;
        }),
      fetch: () => Effect.die("fetch not under test"),
    };

    await withInspected(transport, (collected) =>
      Effect.gen(function* () {
        const inbox = yield* WrapInbox;
        const feed = yield* inbox.open();
        yield* Effect.forkScoped(Stream.runDrain(feed.events));
        yield* eventually(() => handlers.length === 1);

        const tampered = {
          ...reactionWrapForAlice("👍"),
          content: "not-a-seal",
        };
        handlers[0]?.(tampered);
        yield* eventually(() =>
          collected.some((event) => event._tag === "InboxRouted"),
        );

        expect(collected.find((event) => event._tag === "InboxRouted")).toEqual(
          expect.objectContaining({
            wrapId: tampered.id,
            rumorKind: null,
            event: expect.objectContaining({
              _tag: "WrapDropped",
              reason: "unwrap-failed",
            }),
          }),
        );
      }),
    );
  });
});
