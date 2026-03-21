import { Effect, pipe, Schema } from "effect";
import { createRumor, createSeal, createWrap } from "nostr-tools/nip59";
import { NostrPrivateKey, type NostrPublicKeyHex } from "../../identity";
import { NostrEvent, NostrEventDraft, NostrEventId } from "../domain";
import { ErrorWrappingNostrEvent } from "../domain/errors";

export interface CreatedNostrGiftWrap {
  rumorId: NostrEventId;
  wrap: NostrEvent;
}

const cloneDraftForRumor = (
  event: NostrEventDraft,
): Parameters<typeof createRumor>[0] => ({
  content: event.content,
  created_at: event.created_at,
  kind: event.kind,
  tags: event.tags.map((tag) => [tag.name, tag.value, ...(tag.extra ?? [])]),
});

export const createNostrGiftWrap =
  (sk: NostrPrivateKey) =>
  (
    event: NostrEventDraft,
    toPublicKey: NostrPublicKeyHex,
  ): Effect.Effect<CreatedNostrGiftWrap, ErrorWrappingNostrEvent> => {
    const toWrappingError = (message: string, cause: unknown) =>
      new ErrorWrappingNostrEvent({
        cause,
        message,
        originalEvent: event,
        toPublicKey,
      });

    return pipe(
      Effect.try({
        try: () => {
          const rumor = createRumor(cloneDraftForRumor(event), sk);
          const seal = createSeal(rumor, sk, toPublicKey);
          const rumorId = Schema.decodeUnknownSync(NostrEventId)(rumor.id);

          return {
            rumorId,
            wrap: createWrap(seal, toPublicKey),
          };
        },
        catch: (cause) =>
          toWrappingError("Failed to create Nostr gift wrap", cause),
      }),
      Effect.flatMap(({ rumorId, wrap }) =>
        Effect.catchAll(Schema.decodeUnknown(NostrEvent)(wrap), (cause) =>
          toWrappingError(
            "Created Nostr gift wrap did not match expected schema",
            cause,
          ),
        ).pipe(Effect.map((decodedWrap) => ({ rumorId, wrap: decodedWrap }))),
      ),
    );
  };
