import { Either, ParseResult, Schema } from "effect";
import { unwrapToRumor } from "../internal/giftWrap";
import { SignedWrapEvent, tagValues } from "../internal/nostrEvent";
import type { LinkstrIdentityService } from "../services/LinkstrIdentity";
import { decodeReactionRumor } from "../reactions/codec";
import { WrapDropped } from "../reactions/events";
import type { ReactionInboxEvent } from "../reactions/events";

export type ReactionWrapOutcome = ReactionInboxEvent | WrapDropped;

const decodeWrapEither = Schema.decodeUnknownEither(SignedWrapEvent);

/**
 * Full pipeline for one incoming kind-1059 wrap: validate → unwrap → decode
 * into a typed inbox fact. Pure; the subscription machinery streams into it.
 */
export const decodeReactionWrap = (
  input: unknown,
  identity: LinkstrIdentityService,
): ReactionWrapOutcome => {
  const decodedWrap = decodeWrapEither(input);
  if (Either.isLeft(decodedWrap)) {
    return new WrapDropped({ wrapId: null, reason: "malformed-wrap" });
  }
  const wrap = decodedWrap.right;
  const dropped = (reason: WrapDropped["reason"]): WrapDropped =>
    new WrapDropped({ wrapId: wrap.id, reason });

  if (!tagValues(wrap.tags, "p").includes(identity.pubkey)) {
    return dropped("not-addressed-to-me");
  }

  let rumor;
  try {
    rumor = unwrapToRumor(wrap, identity.secretKey);
  } catch (error) {
    return dropped(
      ParseResult.isParseError(error) ? "malformed-rumor" : "unwrap-failed",
    );
  }

  // NIP-59: the rumor author must differ from the ephemeral wrap key, or the
  // sender identity would be forgeable by whoever created the wrap.
  if (rumor.pubkey === wrap.pubkey) return dropped("sender-is-wrap-key");

  return Either.match(decodeReactionRumor(rumor, identity.pubkey), {
    onLeft: dropped,
    onRight: (event) => event,
  });
};
