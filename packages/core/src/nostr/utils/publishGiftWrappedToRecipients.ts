import { Effect, Schema } from "effect";
import type { NostrEvent as NostrToolsEvent, SimplePool } from "nostr-tools";
import type { NostrPrivateKey, NostrPublicKeyHex } from "../../identity";
import type { WebsocketUrl } from "../../utils/schemas";
import {
  type NostrEvent as LinkyNostrEvent,
  NostrEvent,
  type NostrEventDraft,
} from "../domain";
import {
  ErrorSendingNostrEvent,
  ErrorWrappingNostrEvent,
} from "../domain/errors";
import type { GiftWrappedPublishReceipt } from "../PublishReceipt";
import { createNostrGiftWrap } from "./createNostrGiftWrap";

const encodeNostrEventForPublish = (
  event: LinkyNostrEvent,
): Effect.Effect<NostrToolsEvent, ErrorWrappingNostrEvent> =>
  Effect.catchAll(
    Schema.encode(NostrEvent)(event),
    (cause) =>
      new ErrorWrappingNostrEvent({
        cause,
        message: "Failed to encode wrapped Nostr event for publish",
        originalEvent: {
          content: event.content,
          created_at: event.created_at,
          kind: event.kind,
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

const dedupeRecipients = (
  recipients: ReadonlyArray<NostrPublicKeyHex>,
): NostrPublicKeyHex[] => {
  const seen = new Set<string>();
  const unique: NostrPublicKeyHex[] = [];

  for (const recipient of recipients) {
    if (seen.has(recipient)) continue;
    seen.add(recipient);
    unique.push(recipient);
  }

  return unique;
};

export const publishGiftWrappedToRecipients = ({
  event,
  pool,
  recipients,
  relays,
  selfPublicKey,
  signingKey,
}: {
  event: NostrEventDraft;
  pool: SimplePool;
  recipients: ReadonlyArray<NostrPublicKeyHex>;
  relays: WebsocketUrl[];
  selfPublicKey: NostrPublicKeyHex;
  signingKey: NostrPrivateKey;
}): Effect.Effect<
  GiftWrappedPublishReceipt,
  ErrorSendingNostrEvent | ErrorWrappingNostrEvent
> =>
  Effect.gen(function* (_) {
    const createGiftWrap = createNostrGiftWrap(signingKey);
    const uniqueRecipients = dedupeRecipients([selfPublicKey, ...recipients]);

    const wraps = yield* _(
      Effect.forEach(
        uniqueRecipients,
        (recipient) =>
          createGiftWrap(event, recipient).pipe(
            Effect.flatMap(({ rumorId, wrap }) =>
              encodeNostrEventForPublish(wrap).pipe(
                Effect.map((encodedWrap) => ({
                  event: encodedWrap,
                  recipient,
                  rumorId,
                })),
              ),
            ),
          ),
        { concurrency: "unbounded" },
      ),
    );

    yield* Effect.tryPromise({
      try: async () =>
        await Promise.all(
          wraps.map(
            async ({ event: encodedWrap }) =>
              await Promise.any(pool.publish(relays, encodedWrap)),
          ),
        ),
      catch: (cause) =>
        new ErrorSendingNostrEvent({
          cause,
          message:
            "Failed to publish gift-wrapped Nostr event to all intended recipients",
        }),
    });

    const [firstWrap, ...restWraps] = wraps;

    return {
      rumorId: firstWrap.rumorId,
      wraps: [
        {
          event: firstWrap.event,
          recipient: firstWrap.recipient,
        },
        ...restWraps.map(({ event: encodedWrap, recipient }) => ({
          event: encodedWrap,
          recipient,
        })),
      ],
    };
  });
