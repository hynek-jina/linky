import { Either, Schema } from "effect";
import { unwrapToRumor } from "../internal/giftWrap";
import { SignedWrapEvent, tagValues } from "../internal/nostrEvent";
import type { Rumor } from "../internal/nostrEvent";
import type { LinkstrIdentityService } from "../services/LinkstrIdentity";
import { WrapDropped } from "./events";

export interface AuthenticatedWrap {
  readonly wrap: SignedWrapEvent;
  readonly rumor: Rumor;
}

const decodeWrapEither = Schema.decodeUnknownEither(SignedWrapEvent);

/**
 * Vertical-neutral half of inbound processing: validate the outer wrap,
 * decrypt, and authenticate the rumor. Verticals dispatch on the result's
 * rumor kind without touching raw events again.
 */
export const authenticateWrap = (
  input: unknown,
  identity: LinkstrIdentityService,
): Either.Either<AuthenticatedWrap, WrapDropped> => {
  const decodedWrap = decodeWrapEither(input);
  if (Either.isLeft(decodedWrap)) {
    return Either.left(
      new WrapDropped({ wrapId: null, reason: "malformed-wrap" }),
    );
  }
  const wrap = decodedWrap.right;

  if (!tagValues(wrap.tags, "p").includes(identity.pubkey)) {
    return Either.left(
      new WrapDropped({ wrapId: wrap.id, reason: "not-addressed-to-me" }),
    );
  }

  return unwrapToRumor(wrap, identity.secretKey).pipe(
    Either.map((rumor) => ({ wrap, rumor })),
    Either.mapLeft((reason) => new WrapDropped({ wrapId: wrap.id, reason })),
  );
};
