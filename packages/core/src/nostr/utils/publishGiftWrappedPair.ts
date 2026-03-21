import { Effect, Schema } from "effect";
import type { NostrEvent as NostrToolsEvent, SimplePool } from "nostr-tools";
import type { NostrPrivateKey, NostrPublicKeyHex } from "../../identity";
import type { WebsocketUrl } from "../../utils/schemas";
import { NostrEvent, NostrEventDraft } from "../domain";
import {
  ErrorSendingNostrEvent,
  ErrorWrappingNostrEvent,
} from "../domain/errors";
import type { GiftWrappedPublishReceipt } from "../PublishReceipt";
import { createNostrGiftWrap } from "./createNostrGiftWrap";

const encodeNostrEventForPublish = (
  event: NostrEvent,
): Effect.Effect<NostrToolsEvent, ErrorWrappingNostrEvent> =>
  Effect.catchAll(
    Schema.encode(NostrEvent)(event),
    (cause) =>
      new ErrorWrappingNostrEvent({
        cause,
        message: "Failed to encode wrapped Nostr event for publish",
        originalEvent: {
          kind: event.kind,
          content: event.content,
          created_at: event.created_at,
          tags: event.tags,
        },
      }),
  ).pipe(
    Effect.map((encodedEvent) => ({
      content: encodedEvent.content,
      created_at: encodedEvent.created_at,
      id: encodedEvent.id,
      kind: encodedEvent.kind,
      pubkey: encodedEvent.pubkey,
      sig: encodedEvent.sig,
      tags: (encodedEvent.tags ?? []).map((tag) => tag.slice()),
    })),
  );

export const publishGiftWrappedPair = ({
  event,
  pool,
  relays,
  selfPublicKey,
  signingKey,
  toPublicKey,
}: {
  event: NostrEventDraft;
  pool: SimplePool;
  relays: WebsocketUrl[];
  selfPublicKey: NostrPublicKeyHex;
  signingKey: NostrPrivateKey;
  toPublicKey: NostrPublicKeyHex;
}): Effect.Effect<
  GiftWrappedPublishReceipt,
  ErrorSendingNostrEvent | ErrorWrappingNostrEvent
> =>
  Effect.gen(function* (_) {
    const createGiftWrap = createNostrGiftWrap(signingKey);

    const wrapForPeer = yield* _(
      createGiftWrap(event, toPublicKey),
      Effect.flatMap(({ rumorId, wrap }) =>
        encodeNostrEventForPublish(wrap).pipe(
          Effect.map((encodedWrap) => ({
            event: encodedWrap,
            recipient: toPublicKey,
            rumorId,
          })),
        ),
      ),
    );

    const wrapForSelf = yield* _(
      createGiftWrap(event, selfPublicKey),
      Effect.flatMap(({ rumorId, wrap }) =>
        encodeNostrEventForPublish(wrap).pipe(
          Effect.map((encodedWrap) => ({
            event: encodedWrap,
            recipient: selfPublicKey,
            rumorId,
          })),
        ),
      ),
    );

    yield* Effect.tryPromise({
      try: async () =>
        await Promise.all([
          Promise.any(pool.publish(relays, wrapForPeer.event)),
          Promise.any(pool.publish(relays, wrapForSelf.event)),
        ]),
      catch: (cause) =>
        new ErrorSendingNostrEvent({
          cause,
          message: "Failed to publish gift-wrapped Nostr event pair to relays",
        }),
    });

    return {
      rumorId: wrapForPeer.rumorId,
      wraps: [
        {
          event: wrapForPeer.event,
          recipient: wrapForPeer.recipient,
        },
        {
          event: wrapForSelf.event,
          recipient: wrapForSelf.recipient,
        },
      ],
    };
  });
