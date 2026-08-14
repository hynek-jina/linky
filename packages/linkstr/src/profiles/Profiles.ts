import { Effect, Either, Schema } from "effect";
import type { PlainEventReceipt } from "../domain/delivery";
import type {
  AllRelaysUnreachable,
  NoRelayAcceptedEvent,
} from "../domain/errors";
import { NoReadRelaysConfigured } from "../domain/errors";
import type { EventId, Pubkey, UnixSeconds } from "../domain/primitives";
import { Inspector } from "../inspector/Inspector";
import { inspectPlainOperation } from "../internal/inspectPlainOperation";
import type { NostrTags, SignedPlainEvent } from "../internal/nostrEvent";
import { deliverPlainEvent } from "../internal/plainDelivery";
import { fetchPlainEvents } from "../internal/plainFetch";
import { nowUnixSeconds } from "../internal/time";
import { LinkstrIdentity } from "../services/LinkstrIdentity";
import { NostrTransport } from "../services/NostrTransport";
import { RelayPolicy } from "../services/RelayPolicy";
import {
  decodeProfileEvent,
  decodeStatusEvent,
  encodeProfileContent,
  PROFILE_KIND,
  STATUS_D_GENERAL,
  STATUS_KIND,
} from "./codec";
import type { ProfileMetadata, StatusDraft } from "./domain";
import { ProfileUpdated, StatusUpdated } from "./events";

export class ProfileFetchResult extends Schema.Class<ProfileFetchResult>(
  "ProfileFetchResult",
)({
  profile: Schema.NullOr(ProfileUpdated),
  status: Schema.NullOr(StatusUpdated),
}) {}

/** Newest event of `kind` that decodes; `events` arrive newest-first. */
const pickNewest = <A>(
  events: ReadonlyArray<SignedPlainEvent>,
  kind: number,
  decode: (event: SignedPlainEvent) => Either.Either<A, unknown>,
): { fact: A; eventId: EventId } | null => {
  for (const event of events) {
    if (event.kind !== kind) continue;
    const decoded = decode(event);
    if (Either.isRight(decoded)) {
      return { fact: decoded.right, eventId: event.id };
    }
  }
  return null;
};

export class Profiles extends Effect.Service<Profiles>()("linkstr/Profiles", {
  effect: Effect.gen(function* () {
    const context = {
      identity: yield* LinkstrIdentity,
      transport: yield* NostrTransport,
      relayPolicy: yield* RelayPolicy,
    };
    const inspector = yield* Inspector.orNoop;

    const publishProfile = (
      metadata: ProfileMetadata,
    ): Effect.Effect<PlainEventReceipt, NoRelayAcceptedEvent> =>
      deliverPlainEvent(context, {
        kind: PROFILE_KIND,
        tags: [],
        content: encodeProfileContent(metadata),
      }).pipe(
        Effect.map((receipt) => ({
          result: receipt,
          eventIds: [receipt.eventId],
        })),
        inspectPlainOperation(inspector, "profiles.publishProfile", metadata),
      );

    const statusTags = (draft: StatusDraft): NostrTags => {
      const tags: NostrTags = [["d", STATUS_D_GENERAL]];
      if (draft.expiresAt !== undefined) {
        tags.push(["expiration", String(draft.expiresAt)]);
      }
      return tags;
    };

    const publishStatus = (
      draft: StatusDraft,
    ): Effect.Effect<PlainEventReceipt, NoRelayAcceptedEvent> =>
      deliverPlainEvent(context, {
        kind: STATUS_KIND,
        tags: statusTags(draft),
        content: draft.content,
      }).pipe(
        Effect.map((receipt) => ({
          result: receipt,
          eventIds: [receipt.eventId],
        })),
        inspectPlainOperation(inspector, "profiles.publishStatus", draft),
      );

    const fetchProfile = (
      pubkey: Pubkey,
    ): Effect.Effect<
      ProfileFetchResult,
      AllRelaysUnreachable | NoReadRelaysConfigured
    > =>
      Effect.gen(function* () {
        const relays = context.relayPolicy.readRelays;
        if (relays.length === 0) return yield* new NoReadRelaysConfigured();
        const events = yield* fetchPlainEvents(context.transport, relays, {
          kinds: [PROFILE_KIND, STATUS_KIND],
          authors: [pubkey],
        });
        const now: UnixSeconds = yield* nowUnixSeconds;
        const ofAuthor = events.filter((event) => event.pubkey === pubkey);
        const profile = pickNewest(ofAuthor, PROFILE_KIND, decodeProfileEvent);
        const status = pickNewest(ofAuthor, STATUS_KIND, (event) =>
          decodeStatusEvent(event, now),
        );
        return {
          result: new ProfileFetchResult({
            profile: profile?.fact ?? null,
            status: status?.fact ?? null,
          }),
          eventIds: [profile, status].flatMap((picked) =>
            picked === null ? [] : [picked.eventId],
          ),
        };
      }).pipe(
        inspectPlainOperation(inspector, "profiles.fetchProfile", pubkey),
      );

    return { publishProfile, publishStatus, fetchProfile } as const;
  }),
}) {}
