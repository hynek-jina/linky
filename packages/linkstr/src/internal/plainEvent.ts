import { Either, Schema } from "effect";
import { finalizeEvent, verifyEvent } from "nostr-tools";
import type { NostrSecretKey, UnixSeconds } from "../domain/primitives";
import { SignedPlainEvent } from "./nostrEvent";
import type { NostrTags } from "./nostrEvent";

export interface PlainEventTemplate {
  readonly kind: number;
  readonly tags: NostrTags;
  readonly content: string;
}

const decodeSigned = Schema.decodeUnknownSync(SignedPlainEvent);
const decodeSignedEither = Schema.decodeUnknownEither(SignedPlainEvent);

export const signPlainEvent = (
  template: PlainEventTemplate,
  createdAt: UnixSeconds,
  secretKey: NostrSecretKey,
): SignedPlainEvent =>
  decodeSigned(
    finalizeEvent(
      {
        kind: template.kind,
        tags: template.tags,
        content: template.content,
        created_at: createdAt,
      },
      secretKey,
    ),
  );

export type PlainEventFailure = "malformed-event" | "invalid-signature";

/**
 * Plain events have no seal: the event signature is their only
 * authentication, so it is always verified before anything is decoded out.
 */
export const decodeVerifiedPlainEvent = (
  raw: unknown,
): Either.Either<SignedPlainEvent, PlainEventFailure> =>
  Either.gen(function* () {
    const event = yield* decodeSignedEither(raw).pipe(
      Either.mapLeft((): PlainEventFailure => "malformed-event"),
    );
    if (!verifyEvent(event)) {
      return yield* Either.left<PlainEventFailure>("invalid-signature");
    }
    return event;
  });
