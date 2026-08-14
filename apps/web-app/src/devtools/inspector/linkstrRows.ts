import type { InspectorEvent } from "@linky/linkstr";
import {
  NoRelayReachable,
  OwnReactionConfirmed,
  OwnRetractionConfirmed,
  ProfileEventDropped,
  ProfileUpdated,
  ReactionAdded,
  ReactionDraft,
  ReactionRetracted,
  RecipientNotReached,
  RetractionDraft,
  StatusUpdated,
  WrapDropped,
} from "@linky/linkstr";
import { Option, Schema } from "effect";
import type { InspectorRow, InspectorRowLinks } from "./inspectorRows";

const short = (id: string): string => id.slice(0, 8) + "…";

const NOSTR_KIND_NAMES: Record<number, string> = {
  0: "profile",
  5: "delete",
  7: "reaction",
  14: "chat message",
  15: "chat media",
  1059: "gift wrap",
  10000: "mute list",
  10002: "relay list",
  10050: "dm relays",
  30315: "status",
};

const kindLabel = (kind: number): string => {
  const name = NOSTR_KIND_NAMES[kind];
  return name === undefined ? `kind ${kind}` : `${name} (${kind})`;
};

const decodeRawEventSummary = Schema.decodeUnknownOption(
  Schema.Struct({ id: Schema.String, kind: Schema.Number }),
);

const decodeFilterKinds = Schema.decodeUnknownOption(
  Schema.Struct({ kinds: Schema.Array(Schema.Number) }),
);

const filterKindsLabel = (filter: unknown): string =>
  Option.match(decodeFilterKinds(filter), {
    onNone: () => "events",
    onSome: ({ kinds }) => kinds.map(kindLabel).join(", "),
  });

const operationSummary = (name: string, params: unknown): string => {
  if (params instanceof ReactionDraft) {
    return `react ${params.emoji} → ${short(params.to)}`;
  }
  if (params instanceof RetractionDraft) {
    return `retract ${params.reactionIds.length} reaction(s) → ${short(params.to)}`;
  }
  return name;
};

const errorTag = (error: unknown): string | null =>
  typeof error === "object" &&
  error !== null &&
  "_tag" in error &&
  typeof error._tag === "string"
    ? error._tag
    : null;

const failedOperationLinks = (error: unknown): InspectorRowLinks =>
  error instanceof NoRelayReachable || error instanceof RecipientNotReached
    ? {
        rumorId: error.rumorId,
        clientId: error.clientId,
        wrapIds: [error.selfCopy.wrapId, error.recipientCopy.wrapId],
      }
    : {};

const routedSummaryAndLinks = (
  routed: unknown,
  rumorKind: number | null,
): { summary: string; links: InspectorRowLinks } => {
  const kindSuffix =
    rumorKind === null ? "" : ` (rumor ${kindLabel(rumorKind)})`;
  if (routed instanceof ReactionAdded) {
    return {
      summary: `ReactionAdded ${routed.emoji} from ${short(routed.from)}`,
      links: { rumorId: routed.reactionId },
    };
  }
  if (routed instanceof OwnReactionConfirmed) {
    return {
      summary: `OwnReactionConfirmed ${routed.emoji} (own copy)`,
      links: {
        rumorId: routed.reactionId,
        ...(routed.clientId === null ? {} : { clientId: routed.clientId }),
      },
    };
  }
  if (routed instanceof ReactionRetracted) {
    return {
      summary: `ReactionRetracted ${routed.reactionIds.length} reaction(s) from ${short(routed.from)}`,
      links: {},
    };
  }
  if (routed instanceof OwnRetractionConfirmed) {
    return {
      summary: `OwnRetractionConfirmed ${routed.reactionIds.length} reaction(s) (own copy)`,
      links: {
        rumorId: routed.retractionId,
        ...(routed.clientId === null ? {} : { clientId: routed.clientId }),
      },
    };
  }
  if (routed instanceof WrapDropped) {
    return { summary: `WrapDropped ${routed.reason}${kindSuffix}`, links: {} };
  }
  return { summary: `InboxRouted${kindSuffix}`, links: {} };
};

const profileWatchSummary = (routed: unknown, kind: number | null): string => {
  if (routed instanceof ProfileUpdated) {
    return `ProfileUpdated ${short(routed.pubkey)}`;
  }
  if (routed instanceof StatusUpdated) {
    return `StatusUpdated "${routed.content}" ${short(routed.pubkey)}`;
  }
  if (routed instanceof ProfileEventDropped) {
    return `ProfileEventDropped ${routed.reason}${kind === null ? "" : ` (${kindLabel(kind)})`}`;
  }
  return "ProfileWatchRouted";
};

export const linkstrEventToRow = (
  event: InspectorEvent,
  at: number,
): InspectorRow => {
  switch (event._tag) {
    case "OperationSucceeded":
      return {
        at,
        channel: "operation",
        tag: event.name,
        summary: operationSummary(event.name, event.params),
        links: {
          rumorId: event.rumorId,
          clientId: event.clientId,
          wrapIds: [event.selfCopy.wrapId, event.recipientCopy.wrapId],
        },
        payload: event,
      };
    case "OperationFailed": {
      const reason = errorTag(event.error);
      return {
        at,
        channel: "operation",
        tag: event.name,
        summary: `${operationSummary(event.name, event.params)} — failed${reason === null ? "" : `: ${reason}`}`,
        links: failedOperationLinks(event.error),
        payload: event,
      };
    }
    case "WirePublished": {
      const accepted = event.results.filter((result) => result.accepted);
      return {
        at,
        channel: "wire",
        tag: event._tag,
        summary: `publish ${kindLabel(1059)} ${short(event.wrapId)} → ${accepted.length}/${event.results.length} relays accepted`,
        links: { wrapIds: [event.wrapId] },
        payload: event,
      };
    }
    case "WireSubscribed":
      return {
        at,
        channel: "wire",
        tag: event._tag,
        summary: `subscribe ${filterKindsLabel(event.filter)} @ ${event.relay}`,
        links: { relay: event.relay },
        payload: event,
      };
    case "WirePlainPublished": {
      const accepted = event.results.filter((result) => result.accepted);
      return {
        at,
        channel: "wire",
        tag: event._tag,
        summary: `publish ${kindLabel(event.kind)} ${short(event.eventId)} → ${accepted.length}/${event.results.length} relays accepted`,
        links: { wrapIds: [event.eventId] },
        payload: event,
      };
    }
    case "WireFetched": {
      const ids = event.events.flatMap((fetched) =>
        Option.match(decodeRawEventSummary(fetched), {
          onNone: () => [],
          onSome: ({ id }) => [id],
        }),
      );
      return {
        at,
        channel: "wire",
        tag: event._tag,
        summary: `fetch ${filterKindsLabel(event.filter)} ← ${event.relay}: ${event.events.length} event(s)${event.detail === null ? "" : ` — ${event.detail}`}`,
        links: {
          relay: event.relay,
          ...(ids.length === 0 ? {} : { wrapIds: ids }),
        },
        payload: event,
      };
    }
    case "WireSubscriptionEnded":
      return {
        at,
        channel: "wire",
        tag: event._tag,
        summary: `subscription ended @ ${event.relay}${event.detail === null ? "" : ` — ${event.detail}`}`,
        links: { relay: event.relay },
        payload: event,
      };
    case "WireEventReceived":
      return {
        at,
        channel: "wire",
        tag: event._tag,
        summary: Option.match(decodeRawEventSummary(event.event), {
          onNone: () => `event ← ${event.relay}`,
          onSome: ({ id, kind }) =>
            `${kindLabel(kind)} ${short(id)} ← ${event.relay}`,
        }),
        links: {
          relay: event.relay,
          ...Option.match(decodeRawEventSummary(event.event), {
            onNone: () => ({}),
            onSome: ({ id }) => ({ wrapIds: [id] }),
          }),
        },
        payload: event,
      };
    case "InboxWrapDeduped":
      return {
        at,
        channel: "operation",
        tag: event._tag,
        summary: `gift wrap ${short(event.wrapId)} deduped (already handled)`,
        links: { wrapIds: [event.wrapId] },
        payload: event,
      };
    case "InboxRouted": {
      const { links, summary } = routedSummaryAndLinks(
        event.event,
        event.rumorKind,
      );
      return {
        at,
        channel: "operation",
        tag: event._tag,
        summary,
        links: {
          ...links,
          ...(event.wrapId === null ? {} : { wrapIds: [event.wrapId] }),
        },
        payload: event,
      };
    }
    case "PlainOperationSucceeded":
      return {
        at,
        channel: "operation",
        tag: event.name,
        summary: event.name,
        links:
          event.eventIds.length === 0 ? {} : { wrapIds: [...event.eventIds] },
        payload: event,
      };
    case "ProfileWatchRouted":
      return {
        at,
        channel: "operation",
        tag: event._tag,
        summary: profileWatchSummary(event.event, event.kind),
        links: event.eventId === null ? {} : { wrapIds: [event.eventId] },
        payload: event,
      };
  }
};
