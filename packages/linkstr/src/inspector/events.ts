import { Schema } from "effect";
import { WrapDelivery } from "../domain/delivery";
import {
  ClientId,
  RelayUrl,
  RumorId,
  UnixSeconds,
  WrapId,
} from "../domain/primitives";
import { RelayPublishResult } from "../services/NostrTransport";

/**
 * Diagnostic taps over everything linkstr does on nostr, emitted only when the
 * optional `Inspector` service is provided. `Schema.Unknown` fields carry full
 * raw values for display; nothing in the package reads them back.
 */

/** A vertical finished sending, e.g. `name: "reactions.react"`. */
export class OperationSucceeded extends Schema.TaggedClass<OperationSucceeded>()(
  "OperationSucceeded",
  {
    name: Schema.String,
    params: Schema.Unknown,
    rumorId: RumorId,
    clientId: ClientId,
    sentAt: UnixSeconds,
    selfCopy: WrapDelivery,
    recipientCopy: WrapDelivery,
  },
) {}

export class OperationFailed extends Schema.TaggedClass<OperationFailed>()(
  "OperationFailed",
  {
    name: Schema.String,
    params: Schema.Unknown,
    error: Schema.Unknown,
  },
) {}

/** One signed wrap pushed to the write relays, with per-relay outcomes. */
export class WirePublished extends Schema.TaggedClass<WirePublished>()(
  "WirePublished",
  {
    wrapId: WrapId,
    wrap: Schema.Unknown,
    results: Schema.Array(RelayPublishResult),
  },
) {}

export class WireSubscribed extends Schema.TaggedClass<WireSubscribed>()(
  "WireSubscribed",
  {
    relay: RelayUrl,
    filter: Schema.Unknown,
  },
) {}

export class WireSubscriptionEnded extends Schema.TaggedClass<WireSubscriptionEnded>()(
  "WireSubscriptionEnded",
  {
    relay: RelayUrl,
    detail: Schema.NullOr(Schema.String),
  },
) {}

/** A raw relay event as received; relay-controlled, so untyped. */
export class WireEventReceived extends Schema.TaggedClass<WireEventReceived>()(
  "WireEventReceived",
  {
    relay: RelayUrl,
    event: Schema.Unknown,
  },
) {}

/** The inbox skipped a wrap already handled from another relay. */
export class InboxWrapDeduped extends Schema.TaggedClass<InboxWrapDeduped>()(
  "InboxWrapDeduped",
  {
    wrapId: WrapId,
  },
) {}

/**
 * The inbox turned a wrap into a typed fact — including `WrapDropped` ones,
 * which is where unknown rumor kinds surface (`rumorKind` names them; it is
 * null when the wrap failed authentication before decryption).
 */
export class InboxRouted extends Schema.TaggedClass<InboxRouted>()(
  "InboxRouted",
  {
    wrapId: Schema.NullOr(WrapId),
    rumorKind: Schema.NullOr(Schema.Int),
    event: Schema.Unknown,
  },
) {}

export type InspectorEvent =
  | OperationSucceeded
  | OperationFailed
  | WirePublished
  | WireSubscribed
  | WireSubscriptionEnded
  | WireEventReceived
  | InboxWrapDeduped
  | InboxRouted;
