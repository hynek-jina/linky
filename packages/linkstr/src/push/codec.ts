import { Either, Schema } from "effect";
import { verifyEvent } from "nostr-tools";
import { Pubkey, WrapId } from "../domain/primitives";
import {
  LINKY_PUSH_MARKER_TAG,
  LINKY_PUSH_MARKER_VALUE,
} from "../internal/giftWrap";
import { SignedWrapEvent } from "../internal/nostrEvent";

export type PushWrapFailure =
  | "malformed-wrap"
  | "invalid-signature"
  | "missing-push-marker"
  | "unexpected-recipient-count";

export interface PushWrap {
  readonly wrapId: WrapId;
  readonly recipient: Pubkey;
  readonly createdAt: number;
  readonly relayHints: ReadonlyArray<string>;
}

const decodeWrap = Schema.decodeUnknownEither(SignedWrapEvent);
const decodePubkey = Schema.decodeUnknownEither(Pubkey);

const unique = <A>(values: ReadonlyArray<A>): Array<A> => [...new Set(values)];

/**
 * Validates the identity-free portion of a push-marked gift wrap. The push
 * server deliberately cannot decrypt the wrap; the outer signature still
 * authenticates its id, tags and ciphertext for safe routing and dedupe.
 */
export const decodePushWrap = (
  input: unknown,
): Either.Either<PushWrap, PushWrapFailure> =>
  Either.gen(function* () {
    const wrap = yield* decodeWrap(input).pipe(
      Either.mapLeft((): PushWrapFailure => "malformed-wrap"),
    );
    if (!verifyEvent(wrap)) {
      return yield* Either.left<PushWrapFailure>("invalid-signature");
    }
    if (
      !wrap.tags.some(
        (tag) =>
          tag[0] === LINKY_PUSH_MARKER_TAG &&
          tag[1] === LINKY_PUSH_MARKER_VALUE,
      )
    ) {
      return yield* Either.left<PushWrapFailure>("missing-push-marker");
    }

    const recipients = unique(
      wrap.tags.flatMap((tag) => {
        if (tag[0] !== "p" || tag[1] === undefined) return [];
        return Either.match(decodePubkey(tag[1]), {
          onLeft: () => [],
          onRight: (pubkey) => [pubkey],
        });
      }),
    );
    if (recipients.length !== 1) {
      return yield* Either.left<PushWrapFailure>("unexpected-recipient-count");
    }
    const recipient = recipients[0];
    if (recipient === undefined) {
      return yield* Either.left<PushWrapFailure>("unexpected-recipient-count");
    }

    return {
      wrapId: wrap.id,
      recipient,
      createdAt: wrap.created_at,
      relayHints: unique(
        wrap.tags.flatMap((tag) =>
          tag[0] === "p" &&
          tag[1] === recipient &&
          typeof tag[2] === "string" &&
          tag[2].length > 0
            ? [tag[2]]
            : [],
        ),
      ),
    };
  });
