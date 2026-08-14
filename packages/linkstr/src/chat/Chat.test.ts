import { Effect, Either, Exit, Layer } from "effect";
import { generateSecretKey, getPublicKey } from "nostr-tools";
import {
  ClientId,
  NostrSecretKey,
  Pubkey,
  RelayUrl,
  RumorId,
} from "../domain/primitives";
import {
  LINKY_PUSH_MARKER_TAG,
  LINKY_PUSH_MARKER_VALUE,
  unwrapToRumor,
} from "../internal/giftWrap";
import { firstTagValue, SignedWrapEvent } from "../internal/nostrEvent";
import { LinkstrIdentity } from "../services/LinkstrIdentity";
import type { LinkstrIdentityService } from "../services/LinkstrIdentity";
import { NostrTransport, RelayPublishResult } from "../services/NostrTransport";
import { RelayPolicy } from "../services/RelayPolicy";
import { Chat } from "./Chat";
import {
  EditMessageDraft,
  ImageMessageDraft,
  MessageText,
  PrivateImage,
  TextMessageDraft,
} from "./domain";

const makeIdentity = (): LinkstrIdentityService => {
  const secretKey = NostrSecretKey.make(generateSecretKey());
  return { pubkey: Pubkey.make(getPublicKey(secretKey)), secretKey };
};

const alice = makeIdentity();
const bob = makeIdentity();
const relayA = RelayUrl.make("wss://relay-a.test");
const relayB = RelayUrl.make("wss://relay-b.test");
const clientId = ClientId.make("client-42");

const image = new PrivateImage({
  url: "https://blossom.test/image",
  fileType: "image/jpeg",
  encryptionAlgorithm: "aes-gcm",
  key: "01".repeat(32),
  nonce: "02".repeat(12),
  encryptedSha256: "03".repeat(32),
  originalSha256: "04".repeat(32),
  encryptedSize: 1234,
  width: 640,
  height: 480,
  storageEncoding: "base64",
});

interface PublishedWrap {
  readonly wrap: SignedWrapEvent;
}

const recipientOf = (wrap: SignedWrapEvent): string | null =>
  firstTagValue(wrap.tags, "p");

const hasPushMarker = (wrap: SignedWrapEvent): boolean =>
  wrap.tags.some(
    (tag) =>
      tag[0] === LINKY_PUSH_MARKER_TAG && tag[1] === LINKY_PUSH_MARKER_VALUE,
  );

const stubTransport = (
  published: Array<PublishedWrap>,
  acceptFor: (recipient: string | null) => boolean,
): Layer.Layer<NostrTransport> =>
  Layer.succeed(NostrTransport, {
    publish: (relays, wrap) =>
      Effect.sync(() => {
        if (!(wrap instanceof SignedWrapEvent)) {
          throw new Error("chat publish only gift wraps");
        }
        published.push({ wrap });
        return relays.map(
          (relay) =>
            new RelayPublishResult({
              relay,
              accepted: acceptFor(recipientOf(wrap)),
              detail: acceptFor(recipientOf(wrap)) ? null : "blocked",
            }),
        );
      }),
    subscribe: () => Effect.die("subscribe not under test"),
    fetch: () => Effect.die("fetch not under test"),
  });

const runWith = <A, E>(
  transport: Layer.Layer<NostrTransport>,
  program: Effect.Effect<A, E, Chat>,
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
      Effect.provide(Chat.Default.pipe(Layer.provide(dependencies))),
    ),
  );
};

describe("Chat sends", () => {
  it.each([
    {
      name: "text",
      run: (chat: Chat) =>
        chat.sendText(
          new TextMessageDraft({
            to: bob.pubkey,
            content: MessageText.make("hello"),
            clientId,
          }),
        ),
      kind: 14,
    },
    {
      name: "image",
      run: (chat: Chat) =>
        chat.sendImage(
          new ImageMessageDraft({ to: bob.pubkey, image, clientId }),
        ),
      kind: 15,
    },
  ])(
    "publishes readable $name wraps with only the recipient push-marked",
    async ({ run, kind }) => {
      const published: Array<PublishedWrap> = [];
      const exit = await runWith(
        stubTransport(published, () => true),
        Effect.gen(function* () {
          const chat = yield* Chat;
          return yield* run(chat);
        }),
      );

      expect(Exit.isSuccess(exit)).toBe(true);
      if (!Exit.isSuccess(exit)) return;
      expect(exit.value.clientId).toBe(clientId);
      expect(exit.value.selfCopy.acceptedBy).toEqual([relayA, relayB]);
      expect(exit.value.recipientCopy.acceptedBy).toEqual([relayA, relayB]);
      expect(published).toHaveLength(2);

      const self = published.find(
        ({ wrap }) => recipientOf(wrap) === alice.pubkey,
      );
      const recipient = published.find(
        ({ wrap }) => recipientOf(wrap) === bob.pubkey,
      );
      expect(self).toBeDefined();
      expect(recipient).toBeDefined();
      if (self === undefined || recipient === undefined) return;
      expect(hasPushMarker(self.wrap)).toBe(false);
      expect(hasPushMarker(recipient.wrap)).toBe(true);
      expect(recipient.wrap.created_at).toBeLessThanOrEqual(
        Math.ceil(Date.now() / 1000),
      );
      const rumor = Either.getOrThrow(
        unwrapToRumor(recipient.wrap, bob.secretKey),
      );
      expect(rumor.id).toBe(exit.value.messageId);
      expect(rumor.kind).toBe(kind);
    },
  );

  it("publishes unmarked edit wraps and returns the edit reference", async () => {
    const published: Array<PublishedWrap> = [];
    const editOf = RumorId.make("ab".repeat(32));
    const exit = await runWith(
      stubTransport(published, () => true),
      Effect.gen(function* () {
        const chat = yield* Chat;
        return yield* chat.edit(
          new EditMessageDraft({
            to: bob.pubkey,
            editOf,
            content: MessageText.make("edited"),
            clientId,
          }),
        );
      }),
    );

    expect(Exit.isSuccess(exit)).toBe(true);
    if (!Exit.isSuccess(exit)) return;
    expect(exit.value.editOf).toBe(editOf);
    expect(published).toHaveLength(2);
    expect(published.every(({ wrap }) => !hasPushMarker(wrap))).toBe(true);
  });

  it("fails with RecipientNotReached when only the self copy lands", async () => {
    const exit = await runWith(
      stubTransport([], (recipient) => recipient === alice.pubkey),
      Effect.gen(function* () {
        const chat = yield* Chat;
        return yield* chat.sendText(
          new TextMessageDraft({
            to: bob.pubkey,
            content: MessageText.make("hello"),
            clientId,
          }),
        );
      }),
    );

    expect(exit).toEqual(
      Exit.fail(
        expect.objectContaining({
          _tag: "RecipientNotReached",
          clientId,
          recipientCopy: expect.objectContaining({ acceptedBy: [] }),
        }),
      ),
    );
  });

  it("fails with NoRelayReachable when nothing lands", async () => {
    const exit = await runWith(
      stubTransport([], () => false),
      Effect.gen(function* () {
        const chat = yield* Chat;
        return yield* chat.sendText(
          new TextMessageDraft({
            to: bob.pubkey,
            content: MessageText.make("hello"),
            clientId,
          }),
        );
      }),
    );

    expect(exit).toEqual(
      Exit.fail(
        expect.objectContaining({
          _tag: "NoRelayReachable",
          clientId,
          selfCopy: expect.objectContaining({ acceptedBy: [] }),
          recipientCopy: expect.objectContaining({ acceptedBy: [] }),
        }),
      ),
    );
  });
});
