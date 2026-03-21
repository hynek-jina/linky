import { Effect, pipe, Schema } from "effect";
import {
  type EventTemplate,
  finalizeEvent,
  type NostrEvent,
} from "nostr-tools";
import { NostrPrivateKey } from "../../identity";
import { NostrEventDraft } from "../domain";
import { ErrorFinalizingNostrEvent } from "../domain/errors";

const encodedEventToMutable = (
  encodedEvent: typeof NostrEventDraft.Encoded,
): EventTemplate => ({
  content: encodedEvent.content,
  created_at: encodedEvent.created_at,
  kind: encodedEvent.kind,
  tags: (encodedEvent.tags ?? []).map((tag) => tag.slice()),
});

const encodeNostrEventDraft = (
  event: NostrEventDraft,
): Effect.Effect<EventTemplate, ErrorFinalizingNostrEvent> =>
  Effect.catchAll(
    Schema.encode(NostrEventDraft)(event),
    (e) =>
      new ErrorFinalizingNostrEvent({
        cause: e,
        message: "Failed to encode Nostr event",
        originalEvent: event,
      }),
  ).pipe(Effect.map(encodedEventToMutable));

export const finalizeNostrEvent =
  (sk: NostrPrivateKey) =>
  (
    event: NostrEventDraft,
  ): Effect.Effect<NostrEvent, ErrorFinalizingNostrEvent> =>
    pipe(
      encodeNostrEventDraft(event),
      Effect.flatMap((encodedEvent) =>
        Effect.try({
          try: () => finalizeEvent(encodedEvent, sk),
          catch: (cause) =>
            new ErrorFinalizingNostrEvent({
              cause,
              message: "Failed to finalize Nostr event",
              originalEvent: event,
            }),
        }),
      ),
    );
