import { Either } from "effect";
import { decodeReactionRumor } from "../reactions/codec";
import type { ReactionInboxEvent } from "../reactions/events";
import type { LinkstrIdentityService } from "../services/LinkstrIdentity";
import { authenticateWrap } from "./authenticateWrap";
import { WrapDropped } from "./events";

export type ReactionWrapOutcome = ReactionInboxEvent | WrapDropped;

/**
 * Full pipeline for one incoming kind-1059 wrap: authenticate → decode into a
 * typed inbox fact. Pure; the subscription machinery streams into it.
 */
export const decodeReactionWrap = (
  input: unknown,
  identity: LinkstrIdentityService,
): ReactionWrapOutcome =>
  Either.match(authenticateWrap(input, identity), {
    onLeft: (dropped) => dropped,
    onRight: ({ wrap, rumor }) =>
      Either.match(decodeReactionRumor(rumor, identity.pubkey), {
        onLeft: (reason) => new WrapDropped({ wrapId: wrap.id, reason }),
        onRight: (event) => event,
      }),
  });
