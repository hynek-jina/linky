import { Effect, pipe } from "effect";
import type { SimplePool } from "nostr-tools";
import type { NostrPrivateKey } from "../../identity";
import type { WebsocketUrl } from "../../utils/schemas";
import { NostrEventDraft } from "../domain";
import {
  ErrorFinalizingNostrEvent,
  ErrorSendingNostrEvent,
} from "../domain/errors";
import type { PublishedNostrEvent } from "../PublishReceipt";
import { finalizeNostrEvent } from "./finalizeNostrEvent";

export const publishNostrEvent = ({
  event,
  pool,
  relays,
  signingKey,
}: {
  event: NostrEventDraft;
  pool: SimplePool;
  relays: WebsocketUrl[];
  signingKey: NostrPrivateKey;
}): Effect.Effect<
  PublishedNostrEvent,
  ErrorSendingNostrEvent | ErrorFinalizingNostrEvent
> =>
  pipe(
    finalizeNostrEvent(signingKey)(event),
    Effect.flatMap((encodedEvent) =>
      Effect.tryPromise({
        try: async () => {
          await Promise.any(pool.publish(relays, encodedEvent));
          return encodedEvent;
        },
        catch: (cause) =>
          new ErrorSendingNostrEvent({
            cause,
            message: "Failed to publish Nostr event to all relays",
          }),
      }),
    ),
  );
