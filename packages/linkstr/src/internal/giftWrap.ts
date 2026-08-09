import { Either, Schema } from "effect";
import { getEventHash, verifyEvent } from "nostr-tools";
import { decrypt, getConversationKey } from "nostr-tools/nip44";
import { wrapEvent } from "nostr-tools/nip59";
import type { NostrSecretKey, Pubkey } from "../domain/primitives";
import { Rumor, SignedSealEvent, SignedWrapEvent } from "./nostrEvent";

export type UnwrapFailure =
  | "unwrap-failed"
  | "invalid-seal"
  | "sender-forged"
  | "malformed-rumor"
  | "forged-rumor-id";

const decodeWrap = Schema.decodeUnknownSync(SignedWrapEvent);
const decodeSealEither = Schema.decodeUnknownEither(SignedSealEvent);
const decodeRumorEither = Schema.decodeUnknownEither(Rumor);

export const wrapRumorFor = (
  rumor: Rumor,
  senderSecretKey: NostrSecretKey,
  recipient: Pubkey,
): SignedWrapEvent => decodeWrap(wrapEvent(rumor, senderSecretKey, recipient));

const decryptJson = (
  payload: string,
  recipientSecretKey: NostrSecretKey,
  senderPubkey: Pubkey,
): Either.Either<unknown, UnwrapFailure> => {
  try {
    return Either.right(
      JSON.parse(
        decrypt(payload, getConversationKey(recipientSecretKey, senderPubkey)),
      ),
    );
  } catch {
    return Either.left("unwrap-failed");
  }
};

/**
 * Authenticated unwrap. nostr-tools' `unwrapEvent` verifies nothing, so this
 * decrypts by hand and enforces what NIP-59 leaves to the reader:
 * - the seal signature is valid (the only authentication a wrap has),
 * - the rumor author is the seal author and not the ephemeral wrap key,
 *   otherwise the sender identity is forgeable,
 * - the rumor id is the hash of the rumor, otherwise dedupe, receipts and
 *   retraction references can be poisoned.
 */
export const unwrapToRumor = (
  wrap: SignedWrapEvent,
  recipientSecretKey: NostrSecretKey,
): Either.Either<Rumor, UnwrapFailure> =>
  Either.gen(function* () {
    const sealJson = yield* decryptJson(
      wrap.content,
      recipientSecretKey,
      wrap.pubkey,
    );
    const seal = yield* decodeSealEither(sealJson).pipe(
      Either.mapLeft((): UnwrapFailure => "invalid-seal"),
    );
    if (!verifyEvent(seal)) {
      return yield* Either.left<UnwrapFailure>("invalid-seal");
    }

    const rumorJson = yield* decryptJson(
      seal.content,
      recipientSecretKey,
      seal.pubkey,
    );
    const rumor = yield* decodeRumorEither(rumorJson).pipe(
      Either.mapLeft((): UnwrapFailure => "malformed-rumor"),
    );
    if (rumor.pubkey !== seal.pubkey || rumor.pubkey === wrap.pubkey) {
      return yield* Either.left<UnwrapFailure>("sender-forged");
    }
    if (rumor.id !== getEventHash(rumor)) {
      return yield* Either.left<UnwrapFailure>("forged-rumor-id");
    }
    return rumor;
  });
